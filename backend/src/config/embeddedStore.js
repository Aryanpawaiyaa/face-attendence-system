/**
 * Zero-dependency local embedded storage engine.
 * Automatically activated if MongoDB is not running (e.g. on professor's laptop),
 * allowing the entire FaceAttend Pro app to function offline without downloading
 * or configuring any database software.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const DB_FILE = [
  path.resolve(__dirname, '../../data/local_db.json'),
  path.resolve(__dirname, '../../../data/local_db.json')
].find((p) => fs.existsSync(p)) || path.resolve(__dirname, '../../data/local_db.json');

// Ensure parent data folder exists
const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initial seed dataset
function getInitialData() {
  const adminId = 'u-admin-001';
  const teacherUserId = 'u-teacher-001';
  const deptId = 'd-cse-001';
  const courseId = 'c-ml-001';

  return {
    user: [
      {
        id: adminId,
        _id: adminId,
        email: 'superadmin@example.com',
        passwordHash: '$2a$10$F/FvNulQkQlzGpF3ztp..esl0hJmMZVMwxviACcSGk1/vdYHjwJQy', // 123456789
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: teacherUserId,
        _id: teacherUserId,
        email: 'teacher@example.com',
        passwordHash: '$2a$10$F/FvNulQkQlzGpF3ztp..esl0hJmMZVMwxviACcSGk1/vdYHjwJQy', // 123456789
        firstName: 'Anita',
        lastName: 'Verma',
        role: 'TEACHER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    department: [
      {
        id: deptId,
        _id: deptId,
        name: 'Computer Science & Engineering',
        code: 'CSE',
        description: 'Department of Computer Science and Engineering',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    teacher: [
      {
        id: 't-001',
        _id: 't-001',
        userId: teacherUserId,
        employeeId: 'EMP-001',
        departmentId: deptId,
        designation: 'Assistant Professor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    course: [
      {
        id: courseId,
        _id: courseId,
        name: 'Machine Learning',
        code: 'CS601',
        semester: 6,
        departmentId: deptId,
        facultyId: teacherUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    student: [
      {
        id: 's-001',
        _id: 's-001',
        rollNumber: 'CSE-2026-001',
        faceId: 'FACE-CSE-2026-001',
        firstName: 'Rajat',
        lastName: 'Sharma',
        email: 'rajat.sharma@example.com',
        departmentId: deptId,
        semester: 6,
        section: 'A',
        year: 3,
        status: 'ACTIVE',
        faceEnrolled: true,
        faceSamples: 3,
        faceQuality: 0.94,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 's-002',
        _id: 's-002',
        rollNumber: 'CSE-2026-002',
        faceId: 'FACE-CSE-2026-002',
        firstName: 'Priyanka',
        lastName: 'Singh',
        email: 'priyanka.singh@example.com',
        departmentId: deptId,
        semester: 6,
        section: 'A',
        year: 3,
        status: 'ACTIVE',
        faceEnrolled: true,
        faceSamples: 2,
        faceQuality: 0.92,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 's-003',
        _id: 's-003',
        rollNumber: 'CSE-2026-003',
        firstName: 'Pushpendra',
        lastName: 'Kumar',
        email: 'pushpendra.kumar@example.com',
        departmentId: deptId,
        semester: 6,
        section: 'A',
        year: 3,
        status: 'ACTIVE',
        faceEnrolled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    device: [
      {
        id: 'dev-001',
        _id: 'dev-001',
        deviceName: 'Lab PC Webcam',
        deviceCode: 'WEBCAM-DEV-01',
        cameraType: 'WEBCAM',
        connectionMode: 'PUSH',
        building: 'Main Campus',
        room: 'Lab 1',
        status: 'ACTIVE',
        lastHeartbeat: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'dev-002',
        _id: 'dev-002',
        deviceName: 'Gate AMB82 Camera',
        deviceCode: 'AMB82-GATE-01',
        apiKeyHash: '$2a$10$fv9ukVHVaskgem8woMAqRuKbLE.B1eBU3TfsojpLvs/oHepKflXnG',
        cameraType: 'AMB82_MINI',
        connectionMode: 'PUSH',
        building: 'Main Campus',
        room: 'Entrance Gate',
        status: 'ACTIVE',
        lastHeartbeat: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    setting: [
      {
        id: 'global',
        _id: 'global',
        instituteName: 'Smart Attendance System',
        academicYear: '2026-2027',
        attendanceThreshold: 75,
        lateCutoffMinutes: 15,
        requireLiveness: false,
        autoMarkOnRecognize: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    attendance: [
      {
        id: 'att-001',
        _id: 'att-001',
        studentId: 's-001',
        courseId,
        deviceId: 'dev-001',
        attendanceDate: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        status: 'PRESENT',
        confidence: 0.94,
        source: 'WEB_CAMERA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'att-002',
        _id: 'att-002',
        studentId: 's-002',
        courseId,
        deviceId: 'dev-001',
        attendanceDate: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        status: 'PRESENT',
        confidence: 0.92,
        source: 'WEB_CAMERA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    classSession: [
      {
        id: 'sess-001',
        _id: 'sess-001',
        courseId,
        facultyId: teacherUserId,
        deviceId: 'dev-001',
        title: 'Machine Learning Lab Session',
        sessionDate: new Date().toISOString().slice(0, 10),
        startTime: '09:00',
        endTime: '11:00',
        status: 'ACTIVE',
        attendanceCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    notification: [],
    auditLog: [],
    holiday: [],
    unknownFace: [],
    refreshToken: [],
  };
}

let memoryDb = null;

function loadDb() {
  if (memoryDb) return memoryDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      memoryDb = JSON.parse(raw);
    }
  } catch (err) {
    // If parse fails, fallback to seed
  }
  if (!memoryDb) {
    memoryDb = getInitialData();
    saveDb();
  }
  return memoryDb;
}

function saveDb() {
  if (!memoryDb) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2), 'utf-8');
  } catch (err) {
    // Ignore write errors in read-only locations
  }
}

function normalizeDateVal(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}

function matchFilter(item, where) {
  if (!where || Object.keys(where).length === 0) return true;

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR' || key === '$or') {
      if (Array.isArray(val)) {
        if (!val.some((subWhere) => matchFilter(item, subWhere))) return false;
        continue;
      }
    }
    if (key === 'AND' || key === '$and') {
      if (Array.isArray(val)) {
        if (!val.every((subWhere) => matchFilter(item, subWhere))) return false;
        continue;
      }
    }
    if (key === 'NOT' || key === '$not') {
      if (typeof val === 'object') {
        if (matchFilter(item, val)) return false;
        continue;
      }
    }

    let itemVal;
    if (key === 'id' || key === '_id') {
      itemVal = item.id !== undefined ? item.id : item._id;
    } else {
      itemVal = item[key];
    }

    if (val === null) {
      if (itemVal !== null && itemVal !== undefined) return false;
    } else if (val instanceof RegExp) {
      if (!val.test(String(itemVal || ''))) return false;
    } else if (typeof val === 'object' && !(val instanceof Date)) {
      const inList = val.$in || val.in;
      if (Array.isArray(inList)) {
        const matchesIn = inList.some(
          (x) => String(x) === String(itemVal) || ((key === 'id' || key === '_id') && (String(x) === String(item.id) || String(x) === String(item._id)))
        );
        if (!matchesIn) return false;
      }
      const ninList = val.$nin;
      if (Array.isArray(ninList)) {
        const matchesNin = ninList.some((x) => String(x) === String(itemVal));
        if (matchesNin) return false;
      }
      const notVal = val.$ne !== undefined ? val.$ne : val.not;
      if (notVal !== undefined) {
        if (notVal === null) {
          if (itemVal === null || itemVal === undefined) return false;
        } else if (String(itemVal) === String(notVal) || ((key === 'id' || key === '_id') && (String(item.id) === String(notVal) || String(item._id) === String(notVal)))) {
          return false;
        }
      }
      if (val.$regex !== undefined) {
        const re = new RegExp(val.$regex, val.$options || (val.mode === 'insensitive' ? 'i' : ''));
        if (!re.test(String(itemVal || ''))) return false;
      }
      if (val.contains !== undefined) {
        const needle = String(val.contains).toLowerCase();
        const haystack = String(itemVal || '').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (val.startsWith !== undefined) {
        if (!String(itemVal || '').toLowerCase().startsWith(String(val.startsWith).toLowerCase())) return false;
      }

      const gte = val.$gte !== undefined ? val.$gte : val.gte;
      const lte = val.$lte !== undefined ? val.$lte : val.lte;
      const gt = val.$gt !== undefined ? val.$gt : val.gt;
      const lt = val.$lt !== undefined ? val.$lt : val.lt;

      const normItem = normalizeDateVal(itemVal);
      if (gte !== undefined && normItem < normalizeDateVal(gte)) return false;
      if (lte !== undefined && normItem > normalizeDateVal(lte)) return false;
      if (gt !== undefined && normItem <= normalizeDateVal(gt)) return false;
      if (lt !== undefined && normItem >= normalizeDateVal(lt)) return false;
    } else {
      if (Array.isArray(itemVal)) {
        if (!itemVal.includes(val)) return false;
      } else if (key === 'id' || key === '_id') {
        if (String(item.id) !== String(val) && String(item._id) !== String(val)) return false;
      } else if (String(itemVal) !== String(val)) {
        return false;
      }
    }
  }
  return true;
}

function populate(item, include, db) {
  if (!item || !include || Object.keys(include).length === 0) return { ...item };
  const out = { ...item };

  if (include.department && out.departmentId) {
    out.department = db.department.find((d) => d.id === out.departmentId || d._id === out.departmentId) || null;
  }
  if (include.student && out.studentId) {
    out.student = db.student.find((s) => s.id === out.studentId || s._id === out.studentId) || null;
  }
  if (include.device && out.deviceId) {
    out.device = db.device.find((d) => d.id === out.deviceId || d._id === out.deviceId) || null;
  }
  if (include.course && out.courseId) {
    out.course = db.course.find((c) => c.id === out.courseId || c._id === out.courseId) || null;
  }
  if (include.faculty && out.facultyId) {
    out.faculty = db.user.find((u) => u.id === out.facultyId || u._id === out.facultyId) || null;
  }
  if (include.user && out.userId) {
    out.user = db.user.find((u) => u.id === out.userId || u._id === out.userId) || null;
  }
  return out;
}

function createEmbeddedAdapter(modelName) {
  return {
    async findUnique({ where, include = {} } = {}) {
      const db = loadDb();
      const list = db[modelName] || [];
      const item = list.find((d) => matchFilter(d, where));
      return item ? populate(item, include, db) : null;
    },

    async findFirst({ where, include = {}, orderBy } = {}) {
      const db = loadDb();
      let list = (db[modelName] || []).filter((d) => matchFilter(d, where));
      if (orderBy) {
        const field = Object.keys(orderBy)[0];
        const dir = orderBy[field] === 'desc' ? -1 : 1;
        list = [...list].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
      }
      const item = list[0];
      return item ? populate(item, include, db) : null;
    },

    async findMany({ where, include = {}, orderBy, skip = 0, take } = {}) {
      const db = loadDb();
      let list = (db[modelName] || []).filter((d) => matchFilter(d, where));
      if (orderBy) {
        const field = Object.keys(orderBy)[0];
        const dir = orderBy[field] === 'desc' ? -1 : 1;
        list = [...list].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
      }
      if (skip > 0) list = list.slice(skip);
      if (take !== undefined && take > 0) list = list.slice(0, take);
      return list.map((item) => populate(item, include, db));
    },

    async create({ data, include = {} } = {}) {
      const db = loadDb();
      if (!db[modelName]) db[modelName] = [];
      const id = data.id || data._id || uuidv4();
      const now = new Date().toISOString();
      const record = { ...data, id, _id: id, createdAt: data.createdAt || now, updatedAt: now };
      db[modelName].push(record);
      saveDb();
      return populate(record, include, db);
    },

    async createMany({ data } = {}) {
      const db = loadDb();
      if (!db[modelName]) db[modelName] = [];
      const arr = Array.isArray(data) ? data : [data];
      const now = new Date().toISOString();
      for (const d of arr) {
        const id = d.id || d._id || uuidv4();
        db[modelName].push({ ...d, id, _id: id, createdAt: d.createdAt || now, updatedAt: now });
      }
      saveDb();
      return { count: arr.length };
    },

    async update({ where, data, include = {} } = {}) {
      const db = loadDb();
      const list = db[modelName] || [];
      const idx = list.findIndex((d) => matchFilter(d, where));
      if (idx === -1) {
        const err = new Error('Record to update not found');
        err.code = 'P2025';
        throw err;
      }
      const updated = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      list[idx] = updated;
      saveDb();
      return populate(updated, include, db);
    },

    async updateMany({ where, data } = {}) {
      const db = loadDb();
      const list = db[modelName] || [];
      let count = 0;
      const now = new Date().toISOString();
      for (let i = 0; i < list.length; i++) {
        if (matchFilter(list[i], where)) {
          list[i] = { ...list[i], ...data, updatedAt: now };
          count++;
        }
      }
      saveDb();
      return { count };
    },

    async delete({ where } = {}) {
      const db = loadDb();
      const list = db[modelName] || [];
      const idx = list.findIndex((d) => matchFilter(d, where));
      if (idx === -1) {
        const err = new Error('Record to delete not found');
        err.code = 'P2025';
        throw err;
      }
      const [deleted] = list.splice(idx, 1);
      saveDb();
      return deleted;
    },

    async deleteMany({ where } = {}) {
      const db = loadDb();
      const list = db[modelName] || [];
      const before = list.length;
      db[modelName] = list.filter((d) => !matchFilter(d, where));
      const deletedCount = before - db[modelName].length;
      saveDb();
      return { count: deletedCount };
    },

    async count({ where } = {}) {
      const db = loadDb();
      return (db[modelName] || []).filter((d) => matchFilter(d, where)).length;
    },

    async groupBy({ by, where, _count } = {}) {
      const db = loadDb();
      const list = (db[modelName] || []).filter((d) => matchFilter(d, where));
      const groups = {};
      for (const item of list) {
        const key = by.map((f) => item[f]).join('___');
        if (!groups[key]) {
          groups[key] = { keyObj: {}, count: 0 };
          by.forEach((f) => {
            groups[key].keyObj[f] = item[f];
          });
        }
        groups[key].count++;
      }
      return Object.values(groups).map((g) => {
        const res = { ...g.keyObj };
        if (_count) res._count = { _all: g.count };
        return res;
      });
    },
  };
}

function getEmbeddedPrisma() {
  const models = [
    'user',
    'refreshToken',
    'department',
    'teacher',
    'student',
    'device',
    'course',
    'attendance',
    'notification',
    'auditLog',
    'classSession',
    'setting',
    'holiday',
    'unknownFace',
  ];
  const client = {};
  for (const m of models) {
    client[m] = createEmbeddedAdapter(m);
  }
  client.$transaction = async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(client));
  client.$connect = async () => {};
  client.$disconnect = async () => {};
  return client;
}

const POPULATE_META = {
  departmentId: { model: 'department', virtual: 'department' },
  courseId: { model: 'course', virtual: 'course' },
  deviceId: { model: 'device', virtual: 'device' },
  studentId: { model: 'student', virtual: 'student' },
  userId: { model: 'user', virtual: 'user' },
  facultyId: { model: 'user', virtual: 'faculty' },
  resolvedStudentId: { model: 'student', virtual: 'resolvedStudent' },
  resolvedBy: { model: 'user', virtual: 'resolvedByUser' },
  markedBy: { model: 'user', virtual: 'markedByUser' },
  teacherId: { model: 'user', virtual: 'teacher' },
  deviceIds: { model: 'device', virtual: 'devices' },
};

function offlinePopulate(doc, field, select, db) {
  const meta = POPULATE_META[field] || { model: field.replace(/Id$/, '') };
  const refId = doc[field];
  if (!refId) return doc;

  if (Array.isArray(refId)) {
    const list = db[meta.model] || [];
    const foundItems = refId.map((id) => list.find((it) => it.id === id || it._id === id)).filter(Boolean);
    return {
      ...doc,
      [field]: foundItems,
      ...(meta.virtual ? { [meta.virtual]: foundItems } : {}),
    };
  }

  const list = db[meta.model] || [];
  const found = list.find((it) => it.id === refId || it._id === refId);
  if (!found) return doc;

  let populated = { ...found, id: found.id || found._id, _id: found._id || found.id };
  if (select && typeof select === 'string') {
    const allowed = new Set(select.split(/\s+/).filter(Boolean));
    allowed.add('id');
    allowed.add('_id');
    const proj = {};
    for (const k of allowed) {
      if (populated[k] !== undefined) proj[k] = populated[k];
    }
    populated = proj;
  }
  return {
    ...doc,
    [field]: populated,
    ...(meta.virtual ? { [meta.virtual]: populated } : {}),
  };
}

function wrapDoc(record, modelName) {
  if (!record || typeof record !== 'object') return record;
  const id = record.id || record._id;
  const doc = {
    ...record,
    id,
    _id: id,
    toObject() {
      return { ...this };
    },
    toJSON() {
      return { ...this };
    },
    async save() {
      const db = loadDb();
      const list = db[modelName] || [];
      const idx = list.findIndex((r) => r.id === id || r._id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...this, updatedAt: new Date().toISOString() };
        saveDb();
      }
      return this;
    },
  };
  return doc;
}

function applyUpdateToItem(item, update) {
  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) item[k] = v;
  }
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) item[k] = (item[k] || 0) + v;
  }
  if (update.$pull) {
    for (const [k, v] of Object.entries(update.$pull)) {
      if (Array.isArray(item[k])) {
        if (v && v.$in && Array.isArray(v.$in)) {
          item[k] = item[k].filter((x) => !v.$in.includes(x));
        } else {
          item[k] = item[k].filter((x) => x !== v);
        }
      }
    }
  }
  if (!update.$set && !update.$inc && !update.$pull) {
    for (const [k, v] of Object.entries(update)) {
      if (!k.startsWith('$')) item[k] = v;
    }
  }
  item.updatedAt = new Date().toISOString();
}

function resolveAggregateValue(item, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) {
    const field = expr.slice(1);
    if (field.startsWith('_id.')) {
      const sub = field.slice(4);
      return item._id ? item._id[sub] : undefined;
    }
    return item[field];
  }
  return expr;
}

function evalAggregateCond(item, cond) {
  if (!Array.isArray(cond) || cond.length < 3) return 0;
  const [predicate, thenVal, elseVal] = cond;
  if (predicate.$in) {
    const [expr, arr] = predicate.$in;
    const val = resolveAggregateValue(item, expr);
    return Array.isArray(arr) && arr.includes(val) ? thenVal : elseVal;
  }
  if (predicate.$eq) {
    const [expr, expected] = predicate.$eq;
    const val = resolveAggregateValue(item, expr);
    return val === expected ? thenVal : elseVal;
  }
  return elseVal;
}

function executeOfflineAggregate(modelName, pipeline = []) {
  const db = loadDb();
  let current = [...(db[modelName] || [])];

  for (const stage of pipeline) {
    if (stage.$match) {
      current = current.filter((item) => matchFilter(item, stage.$match));
    } else if (stage.$group) {
      const groupSpec = stage.$group;
      const groups = new Map();
      for (const item of current) {
        let keyStr;
        let keyObj;
        if (typeof groupSpec._id === 'object' && groupSpec._id !== null) {
          keyObj = {};
          for (const [k, v] of Object.entries(groupSpec._id)) {
            keyObj[k] = resolveAggregateValue(item, v);
          }
          keyStr = JSON.stringify(keyObj);
        } else {
          keyObj = resolveAggregateValue(item, groupSpec._id);
          keyStr = String(keyObj);
        }

        if (!groups.has(keyStr)) {
          const initial = { _id: keyObj };
          for (const [field, acc] of Object.entries(groupSpec)) {
            if (field === '_id') continue;
            if (acc.$sum !== undefined) initial[field] = 0;
            else if (acc.$addToSet !== undefined) initial[field] = new Set();
            else if (acc.$max !== undefined) initial[field] = -Infinity;
            else if (acc.$avg !== undefined) initial[field] = { sum: 0, count: 0 };
          }
          groups.set(keyStr, initial);
        }

        const g = groups.get(keyStr);
        for (const [field, acc] of Object.entries(groupSpec)) {
          if (field === '_id') continue;
          if (acc.$sum !== undefined) {
            const val = typeof acc.$sum === 'number' ? acc.$sum : Number(resolveAggregateValue(item, acc.$sum)) || 0;
            g[field] += val;
          } else if (acc.$addToSet !== undefined) {
            g[field].add(resolveAggregateValue(item, acc.$addToSet));
          } else if (acc.$max !== undefined) {
            let val = 0;
            if (acc.$max.$cond) {
              val = evalAggregateCond(item, acc.$max.$cond);
            } else {
              val = Number(resolveAggregateValue(item, acc.$max)) || 0;
            }
            if (val > g[field]) g[field] = val;
          } else if (acc.$avg !== undefined) {
            const val = Number(resolveAggregateValue(item, acc.$avg));
            if (!isNaN(val)) {
              g[field].sum += val;
              g[field].count += 1;
            }
          }
        }
      }

      current = Array.from(groups.values()).map((g) => {
        const out = { ...g };
        for (const [k, v] of Object.entries(out)) {
          if (v instanceof Set) out[k] = Array.from(v);
          else if (v && typeof v === 'object' && v.sum !== undefined) {
            out[k] = v.count > 0 ? v.sum / v.count : null;
          }
        }
        return out;
      });
    } else if (stage.$project) {
      current = current.map((item) => {
        const out = { _id: item._id };
        for (const [k, expr] of Object.entries(stage.$project)) {
          if (k === '_id' && expr === 0) {
            delete out._id;
            continue;
          }
          if (expr === 1) {
            out[k] = item[k];
          } else if (typeof expr === 'object' && expr !== null) {
            if (expr.$size) {
              const arr = resolveAggregateValue(item, expr.$size);
              out[k] = Array.isArray(arr) ? arr.length : 0;
            } else {
              out[k] = resolveAggregateValue(item, expr);
            }
          } else {
            out[k] = resolveAggregateValue(item, expr);
          }
        }
        return out;
      });
    } else if (stage.$sort) {
      const entries = Object.entries(stage.$sort);
      current.sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = a[k];
          const bv = b[k];
          const d = dir === -1 ? -1 : 1;
          if (av > bv) return d;
          if (av < bv) return -d;
        }
        return 0;
      });
    } else if (stage.$limit) {
      current = current.slice(0, stage.$limit);
    } else if (stage.$skip) {
      current = current.slice(stage.$skip);
    } else if (stage.$count) {
      const fieldName = stage.$count;
      current = [{ [fieldName]: current.length }];
    }
  }

  return current;
}

class OfflineQuery {
  constructor(modelName, filter = {}, single = false) {
    this.modelName = modelName;
    this.filter = filter;
    this.single = single;
    this._populates = [];
    this._selectFields = null;
    this._sortObj = null;
    this._skipNum = 0;
    this._limitNum = null;
  }
  populate(field, select) {
    this._populates.push({ field, select });
    return this;
  }
  select(fields) {
    this._selectFields = fields;
    return this;
  }
  sort(sortObj) {
    this._sortObj = sortObj;
    return this;
  }
  skip(n) {
    this._skipNum = n;
    return this;
  }
  limit(n) {
    this._limitNum = n;
    return this;
  }
  lean() {
    return this;
  }
  async distinct(field) {
    const list = await this.exec();
    const arr = Array.isArray(list) ? list : [list];
    const set = new Set();
    for (const it of arr) {
      if (it && it[field] !== undefined && it[field] !== null) set.add(it[field]);
    }
    return Array.from(set);
  }
  async exec() {
    const db = loadDb();
    let list = (db[this.modelName] || []).filter((item) => matchFilter(item, this.filter));
    if (this._sortObj) {
      const entries = Object.entries(this._sortObj);
      list = [...list].sort((a, b) => {
        for (const [key, dir] of entries) {
          const k = key === 'id' ? '_id' : key;
          const av = a[k] !== undefined ? a[k] : a[key];
          const bv = b[k] !== undefined ? b[k] : b[key];
          const d = dir === -1 || dir === 'desc' ? -1 : 1;
          if (av > bv) return d;
          if (av < bv) return -d;
        }
        return 0;
      });
    }
    if (this._skipNum > 0) list = list.slice(this._skipNum);
    if (this._limitNum !== null && this._limitNum >= 0) list = list.slice(0, this._limitNum);

    const populated = list.map((item) => {
      let doc = { ...item, id: item.id || item._id, _id: item._id || item.id };
      for (const pop of this._populates) {
        doc = offlinePopulate(doc, pop.field, pop.select, db);
      }
      if (this._selectFields && typeof this._selectFields === 'string') {
        const allowed = new Set(this._selectFields.split(/\s+/).filter(Boolean));
        allowed.add('id');
        allowed.add('_id');
        const proj = {};
        for (const k of allowed) {
          if (doc[k] !== undefined) proj[k] = doc[k];
        }
        doc = proj;
      }
      return wrapDoc(doc, this.modelName);
    });

    if (this.single) {
      return populated.length > 0 ? populated[0] : null;
    }
    return populated;
  }
  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
  catch(reject) {
    return this.exec().catch(reject);
  }
}

function createOfflineModel(modelName, MongooseModel) {
  const handler = {
    get(target, prop, receiver) {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        return Reflect.get(target, prop, receiver);
      }
      if (prop === 'find') {
        return (filter = {}) => new OfflineQuery(modelName, filter, false);
      }
      if (prop === 'findOne') {
        return (filter = {}) => new OfflineQuery(modelName, filter, true);
      }
      if (prop === 'findById') {
        return (id) => new OfflineQuery(modelName, { _id: id }, true);
      }
      if (prop === 'countDocuments') {
        return async (filter = {}) => {
          const db = loadDb();
          const list = db[modelName] || [];
          return list.filter((item) => matchFilter(item, filter)).length;
        };
      }
      if (prop === 'exists') {
        return async (filter = {}) => {
          const db = loadDb();
          const list = db[modelName] || [];
          const item = list.find((it) => matchFilter(it, filter));
          return item ? { _id: item.id || item._id } : null;
        };
      }
      if (prop === 'create') {
        return async (data) => {
          const db = loadDb();
          if (!db[modelName]) db[modelName] = [];
          const id = data.id || data._id || uuidv4();
          const now = new Date().toISOString();
          const record = { ...data, id, _id: id, createdAt: data.createdAt || now, updatedAt: now };
          db[modelName].push(record);
          saveDb();
          return wrapDoc(record, modelName);
        };
      }
      if (prop === 'updateOne') {
        return async (filter, update) => {
          const db = loadDb();
          const list = db[modelName] || [];
          const idx = list.findIndex((it) => matchFilter(it, filter));
          if (idx !== -1) {
            applyUpdateToItem(list[idx], update);
            saveDb();
            return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
          }
          return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
        };
      }
      if (prop === 'updateMany') {
        return async (filter, update) => {
          const db = loadDb();
          const list = db[modelName] || [];
          let count = 0;
          for (let i = 0; i < list.length; i++) {
            if (matchFilter(list[i], filter)) {
              applyUpdateToItem(list[i], update);
              count++;
            }
          }
          if (count > 0) saveDb();
          return { acknowledged: true, modifiedCount: count, matchedCount: count };
        };
      }
      if (prop === 'distinct') {
        return async (field, filter = {}) => {
          const db = loadDb();
          const list = (db[modelName] || []).filter((it) => matchFilter(it, filter));
          const set = new Set();
          for (const it of list) {
            if (it[field] !== undefined && it[field] !== null) set.add(it[field]);
          }
          return Array.from(set);
        };
      }
      if (prop === 'aggregate') {
        return async (pipeline = []) => executeOfflineAggregate(modelName, pipeline);
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(MongooseModel, handler);
}

module.exports = {
  getEmbeddedPrisma,
  loadDb,
  saveDb,
  createOfflineModel,
};
