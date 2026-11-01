/**
 * Teacher-driven face enrolment.
 * Raw images go straight to the ML service, which runs quality gates,
 * duplicate-identity detection and outlier rejection, then stores the
 * embeddings. The backend only keeps enrolment *status* on the Student.
 */
const ApiError = require('../utils/ApiError');
const mlClient = require('./mlClient');
const realtime = require('./realtime.service');
const studentRepository = require('../repositories/student.repository');
const auditLogRepository = require('../repositories/auditLog.repository');
const { Student } = require('../models');
const { saveJpeg } = require('../utils/imageStore');

const MAX_IMAGES = 20;

async function ensureFaceId(student) {
  if (student.faceId) return student.faceId;
  const base = `FACE-${String(student.rollNumber).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Student.exists({ faceId: candidate, _id: { $ne: student.id } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  await studentRepository.update(student.id, { faceId: candidate });
  return candidate;
}

const faceEnrollmentService = {
  async enroll(studentId, { images = [], replace = false, force = false } = {}, user) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');
    if (!Array.isArray(images) || images.length === 0) throw ApiError.badRequest('Provide at least one face image');
    if (images.length > MAX_IMAGES) throw ApiError.badRequest(`At most ${MAX_IMAGES} images per request`);
    if (force && !['SUPER_ADMIN', 'ADMIN'].includes(user?.role)) {
      throw ApiError.forbidden('Only admins can force-enrol low quality or duplicate faces');
    }

    const faceId = await ensureFaceId(student);
    const ml = await mlClient.enroll({
      faceId,
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      rollNumber: student.rollNumber,
      images,
      replace,
      force,
    });

    if (!ml.ok) {
      const results = ml.data?.results || [];
      const dup = results.find((r) => r.reason === 'duplicate_identity');
      const message = dup
        ? `This face already matches ${dup.duplicateOf?.name || dup.duplicateOf?.faceId} (score ${dup.duplicateOf?.score}). Ask an admin to force-enrol if this is correct.`
        : ml.data?.error || 'No usable face samples. Use good lighting and look straight at the camera.';
      throw new ApiError(ml.status === 422 ? 422 : 400, message, results.map((r) => ({ field: `image[${r.index}]`, message: r.reason || 'ok' })));
    }

    const patch = {
      faceEnrolled: ml.data.totalSamples > 0,
      faceSamples: ml.data.totalSamples,
      faceQuality: ml.data.averageQuality,
      faceEnrolledAt: new Date(),
      faceEnrolledBy: user?.id || null,
    };
    if (!student.photoUrl) {
      const firstOk = (ml.data.results || []).find((r) => r.accepted);
      if (firstOk) patch.photoUrl = await saveJpeg('students', images[firstOk.index]).catch(() => null);
    }
    await studentRepository.update(student.id, patch);

    await auditLogRepository.record({
      userId: user?.id,
      action: 'FACE_ENROLLED',
      entity: 'Student',
      entityId: student.id,
      metadata: { faceId, accepted: ml.data.accepted, rejected: ml.data.rejected, totalSamples: ml.data.totalSamples },
    });
    realtime.publish('enrollment', {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      samples: ml.data.totalSamples,
    });

    return { faceId, ...ml.data, student: await studentRepository.findById(student.id) };
  },

  async remove(studentId, user) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw ApiError.notFound('Student not found');
    if (student.faceId) await mlClient.removeIdentity(student.faceId);
    await studentRepository.update(student.id, { faceEnrolled: false, faceSamples: 0, faceQuality: null, faceEnrolledAt: null });
    await auditLogRepository.record({ userId: user?.id, action: 'FACE_REMOVED', entity: 'Student', entityId: student.id });
    return { removed: true };
  },

  async quality(image) {
    if (!image) throw ApiError.badRequest('image is required');
    const ml = await mlClient.quality(image);
    return ml.data;
  },

  /** Re-sync Student.faceEnrolled flags with what the ML gallery really holds. */
  async syncStatus() {
    const ml = await mlClient.identities();
    const items = ml.data?.items || [];
    const byFace = new Map(items.map((i) => [i.faceId, i]));
    const students = await Student.find({ faceId: { $ne: null } }).select('_id faceId').lean();
    let updated = 0;
    for (const s of students) {
      const g = byFace.get(s.faceId);
      // eslint-disable-next-line no-await-in-loop
      await Student.updateOne({ _id: s._id }, { $set: { faceEnrolled: !!g, faceSamples: g?.samples || 0 } });
      updated += 1;
    }
    return { identities: items.length, studentsChecked: updated };
  },
};

module.exports = faceEnrollmentService;
