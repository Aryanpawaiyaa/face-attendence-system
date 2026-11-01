/**
 * CSV bulk import of students.
 * Header (case-insensitive): rollNumber,firstName,lastName,email,phone,
 *   departmentCode,semester,section,year,branch,guardianEmail
 */
const ApiError = require('../utils/ApiError');
const { Student, Department } = require('../models');
const { parseCsv } = require('../utils/csvParse');

const studentImportService = {
  parseCsv,

  async importCsv(text, { dryRun = false } = {}) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw ApiError.badRequest('CSV must contain a header row and at least one student');
    if (rows.length > 5001) throw ApiError.badRequest('Maximum 5000 students per import');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name.toLowerCase());
    for (const req of ['rollnumber', 'firstname', 'lastname', 'departmentcode', 'semester', 'year']) {
      if (idx(req) === -1) throw ApiError.badRequest(`Missing column: ${req}`);
    }
    const departments = await Department.find().lean();
    const deptByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d._id]));

    const results = [];
    let created = 0;
    for (let r = 1; r < rows.length; r += 1) {
      const cols = rows[r];
      const get = (name) => (idx(name) >= 0 ? String(cols[idx(name)] ?? '').trim() : '');
      const rec = {
        rollNumber: get('rollNumber').toUpperCase(),
        firstName: get('firstName'),
        lastName: get('lastName'),
        email: get('email').toLowerCase() || null,
        phone: get('phone') || null,
        section: get('section') || null,
        branch: get('branch') || null,
        guardianEmail: get('guardianEmail').toLowerCase() || null,
        semester: parseInt(get('semester'), 10),
        year: parseInt(get('year'), 10),
        departmentId: deptByCode.get(get('departmentCode').toUpperCase()),
      };
      const problems = [];
      if (!rec.rollNumber) problems.push('rollNumber missing');
      if (!rec.firstName || !rec.lastName) problems.push('name missing');
      if (!rec.departmentId) problems.push(`unknown departmentCode "${get('departmentCode')}"`);
      if (!(rec.semester >= 1 && rec.semester <= 12)) problems.push('semester must be 1-12');
      if (!(rec.year >= 1)) problems.push('year invalid');
      if (rec.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) problems.push('email invalid');
      if (problems.length) {
        results.push({ row: r + 1, rollNumber: rec.rollNumber, ok: false, error: problems.join('; ') });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const exists = await Student.exists({ $or: [{ rollNumber: rec.rollNumber }, ...(rec.email ? [{ email: rec.email }] : [])] });
      if (exists) {
        results.push({ row: r + 1, rollNumber: rec.rollNumber, ok: false, error: 'rollNumber or email already exists' });
        continue;
      }
      if (!dryRun) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await Student.create(rec);
          created += 1;
        } catch (err) {
          results.push({ row: r + 1, rollNumber: rec.rollNumber, ok: false, error: err.message });
          continue;
        }
      }
      results.push({ row: r + 1, rollNumber: rec.rollNumber, ok: true });
    }
    return { dryRun, totalRows: rows.length - 1, created, failed: results.filter((x) => !x.ok).length, results };
  },

  template() {
    return 'rollNumber,firstName,lastName,email,phone,departmentCode,semester,section,year,branch,guardianEmail\nCSE-2026-010,Aarav,Mehta,aarav@example.com,9876543210,CSE,6,A,3,Computer Science,parent@example.com\n';
  },
};

module.exports = studentImportService;
