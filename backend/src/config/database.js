/**
 * Database module: Powered by MongoDB & Mongoose.
 * Exposes Mongoose connection management and a Prisma-compatible query interface
 * so that all existing repositories, services, and middlewares continue to function seamlessly.
 */
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');
const models = require('../models');

const {
  User,
  RefreshToken,
  Department,
  Teacher,
  Student,
  Device,
  Course,
  Attendance,
  Notification,
  AuditLog,
  ClassSession,
  Setting,
  Holiday,
  UnknownFace,
} = models;

const modelMap = {
  user: User,
  refreshToken: RefreshToken,
  department: Department,
  teacher: Teacher,
  student: Student,
  device: Device,
  course: Course,
  attendance: Attendance,
  notification: Notification,
  auditLog: AuditLog,
  classSession: ClassSession,
  setting: Setting,
  holiday: Holiday,
  unknownFace: UnknownFace,
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Prisma-style relation filters, e.g. attendance.where.student = { departmentId }
const RELATIONS = {
  student: { model: 'student', fk: 'studentId' },
  course: { model: 'course', fk: 'courseId' },
  device: { model: 'device', fk: 'deviceId' },
  department: { model: 'department', fk: 'departmentId' },
  user: { model: 'user', fk: 'userId' },
  faculty: { model: 'user', fk: 'facultyId' },
};

/** Replaces relation filters with `<fk>: { in: [...ids] }` (async lookup). */
async function resolveRelations(where) {
  if (!where || typeof where !== 'object') return where;
  const out = { ...where };
  for (const [key, rel] of Object.entries(RELATIONS)) {
    const val = out[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      const sub = convertPrismaWhere(await resolveRelations(val));
      const ids = await modelMap[rel.model].find(sub).distinct('_id');
      delete out[key];
      out[rel.fk] = { in: ids };
    }
  }
  if (Array.isArray(out.OR)) out.OR = await Promise.all(out.OR.map(resolveRelations));
  if (Array.isArray(out.AND)) out.AND = await Promise.all(out.AND.map(resolveRelations));
  return out;
}

async function buildFilter(where) {
  return convertPrismaWhere(await resolveRelations(where));
}

function convertPrismaWhere(where) {
  if (!where) return {};
  const filter = {};

  // Handle composite unique key for Attendance
  if (where.studentId_courseId_attendanceDate) {
    const { studentId, courseId, attendanceDate } = where.studentId_courseId_attendanceDate;
    filter.studentId = studentId;
    filter.courseId = courseId || null;
    filter.attendanceDate = attendanceDate;
    return filter;
  }

  for (const [key, val] of Object.entries(where)) {
    if (key === 'id') {
      if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        if (val.in) filter._id = { $in: val.in };
        else if (val.not) filter._id = { $ne: val.not };
      } else {
        filter._id = val;
      }
    } else if (key === 'OR') {
      filter.$or = val.map(convertPrismaWhere);
    } else if (key === 'AND') {
      filter.$and = val.map(convertPrismaWhere);
    } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
      if (val.contains) {
        filter[key] = { $regex: new RegExp(escapeRegex(val.contains), val.mode === 'insensitive' ? 'i' : '') };
      } else if (val.in) {
        filter[key] = { $in: val.in };
      } else if (val.gte !== undefined || val.lte !== undefined || val.gt !== undefined || val.lt !== undefined) {
        filter[key] = {};
        if (val.gte !== undefined) filter[key].$gte = val.gte;
        if (val.lte !== undefined) filter[key].$lte = val.lte;
        if (val.gt !== undefined) filter[key].$gt = val.gt;
        if (val.lt !== undefined) filter[key].$lt = val.lt;
      } else if (val.not !== undefined) {
        filter[key] = { $ne: val.not };
      } else {
        filter[key] = val;
      }
    } else {
      filter[key] = val;
    }
  }
  return filter;
}

function normalizeDoc(doc, include = {}) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
  obj.id = obj._id;

  // Polyfill includes
  if (include.department && obj.departmentId) {
    if (typeof obj.departmentId === 'object' && obj.departmentId !== null) {
      obj.department = { ...obj.departmentId, id: obj.departmentId._id };
    }
  }
  if (include.student && obj.studentId) {
    if (typeof obj.studentId === 'object' && obj.studentId !== null) {
      obj.student = { ...obj.studentId, id: obj.studentId._id };
    }
  }
  if (include.device && obj.deviceId) {
    if (typeof obj.deviceId === 'object' && obj.deviceId !== null) {
      obj.device = { ...obj.deviceId, id: obj.deviceId._id };
    }
  }
  if (include.course && obj.courseId) {
    if (typeof obj.courseId === 'object' && obj.courseId !== null) {
      obj.course = { ...obj.courseId, id: obj.courseId._id };
    }
  }
  if (include.faculty && obj.facultyId) {
    if (typeof obj.facultyId === 'object' && obj.facultyId !== null) {
      obj.faculty = { ...obj.facultyId, id: obj.facultyId._id };
    }
  }
  if (include.user && obj.userId) {
    if (typeof obj.userId === 'object' && obj.userId !== null) {
      obj.user = { ...obj.userId, id: obj.userId._id };
    }
  }

  // Keep foreign keys as plain id strings (Prisma semantics). Previously a
  // populated FK stayed an object, so code like where: { id: teacher.userId }
  // or Map keys built from studentId silently broke.
  for (const fk of ['departmentId', 'studentId', 'deviceId', 'courseId', 'facultyId', 'userId']) {
    if (obj[fk] && typeof obj[fk] === 'object' && obj[fk]._id) obj[fk] = obj[fk]._id;
  }
  // Never leak password hashes / device key hashes through includes
  if (obj.user) delete obj.user.passwordHash;
  if (obj.faculty) delete obj.faculty.passwordHash;
  if (obj.device) delete obj.device.apiKeyHash;

  return obj;
}

function applyPopulates(query, include = {}) {
  if (include.department) query.populate('departmentId');
  if (include.student) query.populate('studentId');
  if (include.device) query.populate('deviceId');
  if (include.course) query.populate('courseId');
  if (include.faculty) query.populate('facultyId');
  if (include.user) query.populate('userId');
  return query;
}

function createModelAdapter(Model) {
  return {
    async findUnique({ where, include = {}, select } = {}) {
      const filter = await buildFilter(where);
      let q = Model.findOne(filter);
      applyPopulates(q, include);
      if (select) {
        const fields = Object.keys(select).join(' ');
        q.select(fields);
      }
      const doc = await q.exec();
      return normalizeDoc(doc, include);
    },

    async findFirst({ where, include = {}, orderBy, select } = {}) {
      const filter = await buildFilter(where);
      let q = Model.findOne(filter);
      applyPopulates(q, include);
      if (orderBy) {
        const sort = {};
        for (const [k, v] of Object.entries(orderBy)) {
          sort[k === 'id' ? '_id' : k] = v === 'desc' ? -1 : 1;
        }
        q.sort(sort);
      }
      if (select) {
        const fields = Object.keys(select).join(' ');
        q.select(fields);
      }
      const doc = await q.exec();
      return normalizeDoc(doc, include);
    },

    async findMany({ where, include = {}, select, skip, take, orderBy, distinct } = {}) {
      const filter = await buildFilter(where);
      let q = Model.find(filter);
      applyPopulates(q, include);

      if (skip) q.skip(skip);
      if (take) q.limit(take);

      if (orderBy) {
        const sort = {};
        for (const [k, v] of Object.entries(orderBy)) {
          sort[k === 'id' ? '_id' : k] = v === 'desc' ? -1 : 1;
        }
        q.sort(sort);
      }

      if (select) {
        const fields = Object.keys(select).join(' ');
        q.select(fields);
      }

      if (distinct && distinct.length > 0) {
        // Distinct values handling
        const docs = await q.exec();
        const seen = new Set();
        const results = [];
        for (const d of docs) {
          const key = distinct.map((f) => d[f]).join('___');
          if (!seen.has(key)) {
            seen.add(key);
            results.push(normalizeDoc(d, include));
          }
        }
        return results;
      }

      const docs = await q.exec();
      return docs.map((d) => normalizeDoc(d, include));
    },

    async create({ data, include = {} } = {}) {
      const docData = { ...data };
      if (docData.id && !docData._id) {
        docData._id = docData.id;
      }
      let created;
      try {
        created = await Model.create(docData);
      } catch (err) {
        // Map Mongo duplicate-key to the Prisma code the services expect
        if (err && err.code === 11000) {
          err.code = 'P2002';
          err.meta = { target: Object.keys(err.keyPattern || {}) };
        }
        throw err;
      }
      let q = Model.findById(created._id);
      applyPopulates(q, include);
      const doc = await q.exec();
      return normalizeDoc(doc, include);
    },

    async update({ where, data, include = {} } = {}) {
      const filter = await buildFilter(where);
      const updateData = { ...data };
      delete updateData.id;

      const updated = await Model.findOneAndUpdate(filter, { $set: updateData }, { new: true });
      if (!updated) {
        const err = new Error('Record to update not found');
        err.code = 'P2025';
        throw err;
      }
      let q = Model.findById(updated._id);
      applyPopulates(q, include);
      const doc = await q.exec();
      return normalizeDoc(doc, include);
    },

    async updateMany({ where, data } = {}) {
      const filter = await buildFilter(where);
      const res = await Model.updateMany(filter, { $set: data });
      return { count: res.modifiedCount };
    },

    async delete({ where } = {}) {
      const filter = await buildFilter(where);
      const deleted = await Model.findOneAndDelete(filter);
      if (!deleted) {
        const err = new Error('Record to delete not found');
        err.code = 'P2025';
        throw err;
      }
      return normalizeDoc(deleted);
    },

    async deleteMany({ where } = {}) {
      const filter = await buildFilter(where);
      const res = await Model.deleteMany(filter);
      return { count: res.deletedCount };
    },

    async count({ where } = {}) {
      const filter = await buildFilter(where);
      return Model.countDocuments(filter);
    },

    async groupBy({ by, where, _count, orderBy, take, skip } = {}) {
      const filter = await buildFilter(where);
      const groupFields = {};
      by.forEach((field) => {
        groupFields[field] = `$${field}`;
      });

      const pipeline = [
        { $match: filter },
        {
          $group: {
            _id: groupFields,
            count: { $sum: 1 },
          },
        },
      ];
      // Supports orderBy: { _count: { <field>: 'desc' } }
      if (orderBy && orderBy._count) {
        const dir = Object.values(orderBy._count)[0] === 'desc' ? -1 : 1;
        pipeline.push({ $sort: { count: dir } });
      }
      if (skip) pipeline.push({ $skip: skip });
      if (take) pipeline.push({ $limit: take });

      const rows = await Model.aggregate(pipeline);
      return rows.map((r) => {
        const res = { ...r._id };
        if (_count) {
          res._count = { _all: r.count };
        }
        return res;
      });
    },
  };
}

// Build prisma-compatible client
const prisma = {};
for (const [name, Model] of Object.entries(modelMap)) {
  prisma[name] = createModelAdapter(Model);
}

// $connect and $disconnect polyfills
/**
 * Prisma-style $transaction. It was missing entirely, so every call (teacher
 * create/update) crashed with "prisma.$transaction is not a function".
 * Standalone MongoDB has no multi-document transactions, so this runs the
 * steps sequentially; callers that need atomicity compensate on failure
 * (see teacherService.create).
 */
prisma.$transaction = async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma));
prisma.$connect = connectDatabase;
prisma.$disconnect = disconnectDatabase;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  mongoose.set('bufferCommands', false);
  const uri = env.databaseUrl.startsWith('mongodb') ? env.databaseUrl : 'mongodb://127.0.0.1:27017/smart_attendance';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    // Build declared indexes (unique attendance per student/course/day etc.)
    await Promise.all(Object.values(modelMap).map((M) => M.syncIndexes().catch(() => null)));
    logger.info(`Database connected to MongoDB at ${uri.replace(/\/\/[^@]+@/, '//***@')}`);
  } catch (err) {
    logger.warn(`Could not connect to MongoDB at ${uri} (${err.message}).`);
    logger.info('[DATABASE] Activating Zero-Dependency Embedded Storage Engine. Pre-seeded with Super Admin, Teacher, and Demo Data.');
    const { getEmbeddedPrisma } = require('./embeddedStore');
    const embedded = getEmbeddedPrisma();
    Object.assign(prisma, embedded);
  }
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Database disconnected');
  }
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  models,
};
