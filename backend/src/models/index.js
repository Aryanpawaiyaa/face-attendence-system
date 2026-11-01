const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// 1. User
const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'], default: 'TEACHER' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
userSchema.virtual('id').get(function () {
  return this._id;
});

// 2. RefreshToken
const refreshTokenSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true, ref: 'User' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    createdByIp: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
refreshTokenSchema.virtual('id').get(function () {
  return this._id;
});

// 3. Department
const departmentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
departmentSchema.virtual('id').get(function () {
  return this._id;
});

// 4. Teacher
const teacherSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    userId: { type: String, required: true, unique: true, ref: 'User' },
    employeeId: { type: String, required: true, unique: true, trim: true },
    departmentId: { type: String, ref: 'Department', default: null },
    designation: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
teacherSchema.virtual('id').get(function () {
  return this._id;
});

// 5. Student
const studentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    rollNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    faceId: { type: String, unique: true, sparse: true, trim: true, default: null },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true, default: null },
    phone: { type: String, default: null },
    departmentId: { type: String, required: true, ref: 'Department' },
    branch: { type: String, default: null },
    semester: { type: Number, required: true, min: 1, max: 12 },
    section: { type: String, default: null },
    year: { type: Number, required: true, min: 1, max: 2100 }, // year of study or batch year
    photoUrl: { type: String, default: null },
    guardianEmail: { type: String, default: null, lowercase: true, trim: true },
    // Face enrolment state (biometric templates live only in the ML service)
    faceEnrolled: { type: Boolean, default: false },
    faceSamples: { type: Number, default: 0 },
    faceQuality: { type: Number, default: null },
    faceEnrolledAt: { type: Date, default: null },
    faceEnrolledBy: { type: String, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED'],
      default: 'ACTIVE',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
studentSchema.virtual('id').get(function () {
  return this._id;
});

// 6. Device
const deviceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    deviceName: { type: String, required: true, trim: true },
    deviceCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    apiKeyHash: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'], default: 'ACTIVE' },
    building: { type: String, default: null },
    room: { type: String, default: null },
    lastActiveAt: { type: Date, default: null },
    // Camera / AMB82 Mini connectivity
    cameraType: { type: String, enum: ['AMB82_MINI', 'IP_CAMERA', 'WEBCAM', 'OTHER'], default: 'AMB82_MINI' },
    connectionMode: { type: String, enum: ['PUSH', 'RTSP', 'MJPEG'], default: 'PUSH' },
    streamUrl: { type: String, default: null }, // e.g. rtsp://192.168.1.50:554
    ipAddress: { type: String, default: null },
    firmwareVersion: { type: String, default: null },
    streaming: { type: Boolean, default: false },
    defaultCourseId: { type: String, ref: 'Course', default: null },
    framesReceived: { type: Number, default: 0 },
    recognitions: { type: Number, default: 0 },
    lastFrameAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
deviceSchema.virtual('id').get(function () {
  return this._id;
});

// 7. Course
const courseSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    departmentId: { type: String, required: true, ref: 'Department' },
    facultyId: { type: String, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
courseSchema.virtual('id').get(function () {
  return this._id;
});

// 8. Attendance
const attendanceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    studentId: { type: String, required: true, ref: 'Student' },
    courseId: { type: String, ref: 'Course', default: null },
    deviceId: { type: String, ref: 'Device', default: null },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'HOLIDAY'], default: 'PRESENT' },
    source: {
      type: String,
      enum: ['DEVICE', 'STREAM', 'WEB_CAMERA', 'KIOSK', 'GROUP_PHOTO', 'MANUAL', 'IMPORT', 'IP_CAMERA', 'AMB82_MINI'],
      default: 'DEVICE',
    },
    confidenceScore: { type: Number, default: null },
    markedAt: { type: Date, default: Date.now },
    attendanceDate: { type: Date, required: true },
    sessionId: { type: String, ref: 'ClassSession', default: null },
    livenessScore: { type: Number, default: null },
    snapshotUrl: { type: String, default: null },
    markedBy: { type: String, ref: 'User', default: null },
    correctedBy: { type: String, ref: 'User', default: null },
    correctionReason: { type: String, default: null },
    previousStatus: { type: String, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
attendanceSchema.virtual('id').get(function () {
  return this._id;
});
// Composite uniqueness on studentId, courseId, attendanceDate
attendanceSchema.index({ studentId: 1, courseId: 1, attendanceDate: 1 }, { unique: true });

// 9. Notification
const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    userId: { type: String, ref: 'User', default: null },
    attendanceId: { type: String, ref: 'Attendance', unique: true, sparse: true, default: null },
    type: { type: String, enum: ['ATTENDANCE_ALERT', 'DEVICE_OFFLINE', 'SYSTEM', 'UNKNOWN_FACE', 'LOW_ATTENDANCE'], required: true },
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS'], default: 'IN_APP' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
notificationSchema.virtual('id').get(function () {
  return this._id;
});

// 10. AuditLog
const auditLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    userId: { type: String, ref: 'User', default: null },
    action: {
      type: String,
      enum: [
        'LOGIN',
        'LOGOUT',
        'LOGIN_FAILED',
        'ATTENDANCE_MARKED',
        'ATTENDANCE_REJECTED',
        'DEVICE_REGISTERED',
        'DEVICE_REQUEST',
        'DEVICE_HEARTBEAT',
        'ADMIN_ACTION',
        'ERROR',
        'FACE_ENROLLED',
        'FACE_REMOVED',
        'SESSION_STARTED',
        'SESSION_CLOSED',
        'ATTENDANCE_CORRECTED',
        'SETTINGS_UPDATED',
        'UNKNOWN_FACE',
        'STREAM_STARTED',
        'STREAM_STOPPED',
        'DEVICE_KEY_ROTATED',
        'STUDENTS_IMPORTED',
      ],
      required: true,
    },
    entity: { type: String, default: null },
    entityId: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);
auditLogSchema.virtual('id').get(function () {
  return this._id;
});

const baseOpts = { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } };
function withId(schema) {
  schema.virtual('id').get(function () {
    return this._id;
  });
  return schema;
}

// 11. ClassSession - a live attendance window for a course (lecture/lab)
const classSessionSchema = withId(
  new mongoose.Schema(
    {
      _id: { type: String, default: uuidv4 },
      title: { type: String, required: true, trim: true },
      courseId: { type: String, ref: 'Course', default: null },
      departmentId: { type: String, ref: 'Department', default: null },
      semester: { type: Number, default: null },
      section: { type: String, default: null },
      teacherId: { type: String, ref: 'User', required: true },
      deviceIds: [{ type: String, ref: 'Device' }],
      room: { type: String, default: null },
      startAt: { type: Date, required: true },
      endAt: { type: Date, default: null },
      lateAfterMinutes: { type: Number, default: 10 },
      status: { type: String, enum: ['SCHEDULED', 'ACTIVE', 'CLOSED'], default: 'ACTIVE' },
      autoMarkAbsent: { type: Boolean, default: true },
      closedAt: { type: Date, default: null },
      stats: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    baseOpts
  )
);
classSessionSchema.index({ status: 1, startAt: -1 });

// 12. Setting - single document holding institution-wide policy
const settingSchema = withId(
  new mongoose.Schema(
    {
      _id: { type: String, default: 'global' },
      institutionName: { type: String, default: 'FaceAttend Institute' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      lateCutoff: { type: String, default: '10:00' }, // HH:mm local time
      recognitionThreshold: { type: Number, default: 0.45 },
      minAttendancePercent: { type: Number, default: 75 },
      workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0=Sun
      blockOnHolidays: { type: Boolean, default: true },
      requireLiveness: { type: Boolean, default: false },
      saveSnapshots: { type: Boolean, default: true },
      unknownFaceAlerts: { type: Boolean, default: true },
      deviceOfflineMinutes: { type: Number, default: 15 },
    },
    baseOpts
  )
);

// 13. Holiday
const holidaySchema = withId(
  new mongoose.Schema(
    {
      _id: { type: String, default: uuidv4 },
      date: { type: Date, required: true, unique: true },
      name: { type: String, required: true, trim: true },
      type: { type: String, enum: ['PUBLIC', 'INSTITUTE', 'EXAM', 'OTHER'], default: 'INSTITUTE' },
    },
    baseOpts
  )
);

// 14. UnknownFace - unrecognised faces captured by cameras, for review
const unknownFaceSchema = withId(
  new mongoose.Schema(
    {
      _id: { type: String, default: uuidv4 },
      deviceId: { type: String, ref: 'Device', default: null },
      sessionId: { type: String, ref: 'ClassSession', default: null },
      snapshotUrl: { type: String, default: null },
      bestCandidateFaceId: { type: String, default: null },
      bestScore: { type: Number, default: null },
      qualityScore: { type: Number, default: null },
      spoofSuspected: { type: Boolean, default: false },
      status: { type: String, enum: ['PENDING', 'RESOLVED', 'DISMISSED'], default: 'PENDING' },
      resolvedStudentId: { type: String, ref: 'Student', default: null },
      resolvedBy: { type: String, ref: 'User', default: null },
    },
    baseOpts
  )
);
unknownFaceSchema.index({ status: 1, createdAt: -1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const ClassSession = mongoose.models.ClassSession || mongoose.model('ClassSession', classSessionSchema);
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
const Holiday = mongoose.models.Holiday || mongoose.model('Holiday', holidaySchema);
const UnknownFace = mongoose.models.UnknownFace || mongoose.model('UnknownFace', unknownFaceSchema);
const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);
const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);
const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema);
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

const { createOfflineModel } = require('../config/embeddedStore');

module.exports = {
  User: createOfflineModel('user', User),
  RefreshToken: createOfflineModel('refreshToken', RefreshToken),
  Department: createOfflineModel('department', Department),
  Teacher: createOfflineModel('teacher', Teacher),
  Student: createOfflineModel('student', Student),
  Device: createOfflineModel('device', Device),
  Course: createOfflineModel('course', Course),
  Attendance: createOfflineModel('attendance', Attendance),
  Notification: createOfflineModel('notification', Notification),
  AuditLog: createOfflineModel('auditLog', AuditLog),
  ClassSession: createOfflineModel('classSession', ClassSession),
  Setting: createOfflineModel('setting', Setting),
  Holiday: createOfflineModel('holiday', Holiday),
  UnknownFace: createOfflineModel('unknownFace', UnknownFace),
};
