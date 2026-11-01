/* eslint-disable no-console */
/**
 * Seeds: super admin, a demo teacher, CSE department, one course,
 * demo students, the default settings document and a webcam device
 * (prints its API key). Safe to run multiple times.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { connectDatabase, disconnectDatabase, models } = require('../src/config/database');

const { User, Teacher, Department, Course, Device, Setting, Student } = models;

async function upsertUser({ email, password, firstName, lastName, role }) {
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`  = ${role.padEnd(11)} ${email} (exists)`);
    return existing;
  }
  const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12), firstName, lastName, role, status: 'ACTIVE' });
  console.log(`  + ${role.padEnd(11)} ${email} / ${password}`);
  return user;
}

async function main() {
  await connectDatabase();
  console.log('\nSeeding FaceAttend Pro...');

  await Setting.updateOne({ _id: 'global' }, { $setOnInsert: { _id: 'global' } }, { upsert: true });

  const admin = await upsertUser({
    email: process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@example.com',
    password: process.env.SEED_SUPER_ADMIN_PASSWORD || '123456789',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
  });

  let dept = await Department.findOne({ code: 'CSE' });
  if (!dept) dept = await Department.create({ name: 'Computer Science & Engineering', code: 'CSE', description: 'Demo department' });

  const teacherUser = await upsertUser({
    email: process.env.SEED_TEACHER_EMAIL || 'teacher@example.com',
    password: process.env.SEED_TEACHER_PASSWORD || '123456789',
    firstName: 'Anita',
    lastName: 'Verma',
    role: 'TEACHER',
  });
  if (!(await Teacher.findOne({ userId: teacherUser._id }))) {
    await Teacher.create({ userId: teacherUser._id, employeeId: 'EMP-001', departmentId: dept._id, designation: 'Assistant Professor' });
  }

  if (!(await Course.findOne({ code: 'CS601' }))) {
    await Course.create({ name: 'Machine Learning', code: 'CS601', semester: 6, departmentId: dept._id, facultyId: teacherUser._id });
  }

  const demoStudents = [
    ['CSE-2026-001', 'Rajat', 'Sharma'],
    ['CSE-2026-002', 'Priyanka', 'Singh'],
    ['CSE-2026-003', 'Pushpendra', 'Kumar'],
  ];
  for (const [rollNumber, firstName, lastName] of demoStudents) {
    if (!(await Student.findOne({ rollNumber }))) {
      await Student.create({ rollNumber, firstName, lastName, departmentId: dept._id, semester: 6, section: 'A', year: 3 });
      console.log(`  + student    ${rollNumber} ${firstName} ${lastName} (enrol the face from the UI)`);
    }
  }

  if (!(await Device.findOne({ deviceCode: 'WEBCAM-DEV-01' }))) {
    const apiKey = `amb82_${crypto.randomBytes(24).toString('hex')}`;
    await Device.create({
      deviceName: 'Lab PC Webcam',
      deviceCode: 'WEBCAM-DEV-01',
      apiKeyHash: await bcrypt.hash(apiKey, 12),
      cameraType: 'WEBCAM',
      connectionMode: 'PUSH',
      building: 'Main',
      room: 'Lab 1',
    });
    console.log(`  + device     WEBCAM-DEV-01  API key: ${apiKey}`);
    console.log('    (copy it into DEVICE_API_KEY of the root .env if you use run_attendance.py)');
  }

  console.log(`\nDone. Log in at http://localhost:5173 as ${admin.email}`);
  console.log('IMPORTANT: change the default passwords after first login.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
