const { Student, Teacher, Course, Device, Department, Attendance, ClassSession, UnknownFace } = require('../models');
const { toDateOnly } = require('./attendance.repository');
const analyticsService = require('../services/analytics.service');

const dashboardRepository = {
  async getTotals() {
    const [students, enrolledFaces, teachers, courses, devices, activeDevices, departments, activeSessions, pendingUnknown] =
      await Promise.all([
        Student.countDocuments({ status: 'ACTIVE' }),
        Student.countDocuments({ status: 'ACTIVE', faceEnrolled: true }),
        Teacher.countDocuments(),
        Course.countDocuments(),
        Device.countDocuments(),
        Device.countDocuments({ status: 'ACTIVE' }),
        Department.countDocuments(),
        ClassSession.countDocuments({ status: 'ACTIVE' }),
        UnknownFace.countDocuments({ status: 'PENDING' }),
      ]);
    return { students, enrolledFaces, teachers, courses, devices, activeDevices, departments, activeSessions, pendingUnknown };
  },

  async getTodayBreakdown() {
    const today = toDateOnly(new Date());
    const [grouped, totalActiveStudents, marked] = await Promise.all([
      Attendance.aggregate([{ $match: { attendanceDate: today } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Student.countDocuments({ status: 'ACTIVE' }),
      Attendance.distinct('studentId', { attendanceDate: today, status: { $in: ['PRESENT', 'LATE'] } }),
    ]);
    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
    for (const g of grouped) counts[g._id] = g.n;
    return {
      date: today,
      counts,
      totalActiveStudents,
      presentStudents: marked.length,
      notYetMarked: Math.max(totalActiveStudents - marked.length - counts.ABSENT - counts.EXCUSED, 0),
      attendanceRate: totalActiveStudents ? Math.round((marked.length / totalActiveStudents) * 1000) / 10 : 0,
    };
  },

  async getDepartmentWiseAttendance({ from, to }) {
    return (await analyticsService.departmentWise({ from, to })).departments;
  },

  async getTrend({ days = 7 }) {
    return analyticsService.trend({ days });
  },

  async getTopAbsentees({ from, to, limit = 10 }) {
    const rows = await Attendance.aggregate([
      { $match: { status: 'ABSENT', attendanceDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$studentId', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: limit },
    ]);
    const students = await Student.find({ _id: { $in: rows.map((r) => r._id) } })
      .select('rollNumber firstName lastName departmentId photoUrl')
      .lean();
    const byId = new Map(students.map((s) => [s._id, { ...s, id: s._id }]));
    return rows.map((r) => ({ student: byId.get(r._id) || null, absentCount: r.n }));
  },

  async getDeviceHealth({ staleMinutes = 15 } = {}) {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const devices = await Device.find()
      .select('deviceName deviceCode status lastActiveAt building room cameraType connectionMode streaming recognitions ipAddress firmwareVersion')
      .sort({ deviceName: 1 })
      .lean();
    return devices.map((d) => ({
      ...d,
      id: d._id,
      isStale: d.status === 'ACTIVE' && (!d.lastActiveAt || d.lastActiveAt < cutoff),
    }));
  },
};

module.exports = dashboardRepository;
