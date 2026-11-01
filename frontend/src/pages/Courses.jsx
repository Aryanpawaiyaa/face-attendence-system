import { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { del, errMsg, get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { Empty, Field, Modal, PageHead, Pager, Spinner, useToast } from '../components/UI';

const EMPTY_COURSE = {
  name: '',
  code: '',
  semester: 1,
  departmentId: '',
  facultyId: '',
};

export default function Courses() {
  const { user } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [semester, setSemester] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formData, setFormData] = useState(EMPTY_COURSE);
  const [formBusy, setFormBusy] = useState(false);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCourseForAssign, setSelectedCourseForAssign] = useState(null);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Fetch departments
  const { data: deptData } = useFetch('/departments');
  const departments = deptData?.items || deptData || [];

  // Fetch faculty members (teachers + admins)
  const [facultyList, setFacultyList] = useState([]);
  useEffect(() => {
    Promise.all([
      get('/teachers', { limit: 100 }).catch(() => ({ items: [] })),
      get('/admins', { limit: 100 }).catch(() => ({ items: [] })),
    ]).then(([tRes, aRes]) => {
      const teachers = (tRes.items || []).map((t) => ({
        id: t.user?.id || t.userId || t.id,
        name: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || t.employeeId,
        email: t.user?.email || '',
        role: 'Faculty',
      }));
      const admins = (aRes.items || []).map((a) => ({
        id: a.id,
        name: `${a.firstName || ''} ${a.lastName || ''}`.trim(),
        email: a.email || '',
        role: a.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin',
      }));

      // Deduplicate by id
      const map = new Map();
      [...teachers, ...admins].forEach((f) => {
        if (f.id && !map.has(f.id)) map.set(f.id, f);
      });
      setFacultyList(Array.from(map.values()));
    });
  }, []);

  // Fetch courses with filters
  const { data: courseData, loading, mutate } = useFetch(
    `/courses?${new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search: search.trim() } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(semester ? { semester: String(semester) } : {}),
    }).toString()}`
  );

  const courses = courseData?.items || [];
  const pagination = courseData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Open Add/Edit Modal
  const handleOpenForm = (course = null) => {
    setEditingCourse(course);
    if (course) {
      setFormData({
        name: course.name || '',
        code: course.code || '',
        semester: course.semester || 1,
        departmentId: course.departmentId || course.department?.id || departments[0]?.id || '',
        facultyId: course.facultyId || course.faculty?.id || '',
      });
    } else {
      setFormData({
        ...EMPTY_COURSE,
        departmentId: departments[0]?.id || '',
      });
    }
    setFormOpen(true);
  };

  // Submit Course Form
  const handleSaveCourse = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        semester: Number(formData.semester),
        departmentId: formData.departmentId,
        facultyId: formData.facultyId || null,
      };

      if (editingCourse) {
        await put(`/courses/${editingCourse.id}`, payload);
        toast('Course updated successfully', 'success');
      } else {
        await post('/courses', payload);
        toast('Course added successfully', 'success');
      }

      setFormOpen(false);
      mutate();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setFormBusy(false);
    }
  };

  // Open Quick Assign Faculty Modal
  const handleOpenAssign = (course) => {
    setSelectedCourseForAssign(course);
    setSelectedFacultyId(course.facultyId || course.faculty?.id || '');
    setAssignModalOpen(true);
  };

  // Save Quick Assign Faculty
  const handleSaveAssign = async () => {
    if (!selectedCourseForAssign || !selectedFacultyId) return;
    setAssignBusy(true);
    try {
      await post(`/courses/${selectedCourseForAssign.id}/assign-faculty`, {
        facultyId: selectedFacultyId,
      });
      toast('Faculty assigned to course successfully', 'success');
      setAssignModalOpen(false);
      mutate();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setAssignBusy(false);
    }
  };

  // Delete Course
  const handleDeleteCourse = async () => {
    if (!deletingCourse) return;
    setDeleteBusy(true);
    try {
      await del(`/courses/${deletingCourse.id}`);
      toast('Course deleted successfully', 'success');
      setDeleteModalOpen(false);
      mutate();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const isSuperAdminOrAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);

  return (
    <div className="courses-page">
      <PageHead
        title="Course Management & Expansion"
        subtitle="Dynamically configure academic courses, syllabi, semesters, and map teaching faculty."
        actions={
          isSuperAdminOrAdmin && (
            <button className="btn btn-primary" onClick={() => handleOpenForm()}>
              <Plus size={16} /> Add Course
            </button>
          )
        }
      />

      {/* Quick Stat Cards */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <div className="stat-label">Total Courses</div>
          <div className="stat-value">{pagination.total || courses.length}</div>
          <div className="stat-sub">Active curriculum modules</div>
        </div>
        <div className="panel stat-card">
          <div className="stat-label">Departments Covered</div>
          <div className="stat-value">{departments.length}</div>
          <div className="stat-sub">Academic divisions</div>
        </div>
        <div className="panel stat-card">
          <div className="stat-label">Faculty Mappings</div>
          <div className="stat-value">
            {courses.filter((c) => c.facultyId || c.faculty).length}
          </div>
          <div className="stat-sub">Courses with assigned instructors</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="panel filter-bar" style={{ marginBottom: 18 }}>
        <div className="row grow" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="search-input grow" style={{ minWidth: 220 }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="input"
              placeholder="Search by course code, name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="select"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 220 }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 160 }}
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Courses Table */}
      {loading ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <Spinner size={32} />
        </div>
      ) : courses.length === 0 ? (
        <Empty
          title="No courses found"
          description={
            search || departmentId || semester
              ? 'Try adjusting your search filters.'
              : 'Start by expanding your curriculum with new courses.'
          }
          action={
            isSuperAdminOrAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenForm()}>
                <Plus size={14} /> Add First Course
              </button>
            )
          }
        />
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Course Name</th>
                <th>Department</th>
                <th style={{ width: 110 }}>Semester</th>
                <th>Assigned Faculty</th>
                {isSuperAdminOrAdmin && <th style={{ textAlign: 'right', width: 140 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const fac = course.faculty;
                const facultyName = fac ? `${fac.firstName || ''} ${fac.lastName || ''}`.trim() : null;

                return (
                  <tr key={course.id}>
                    <td>
                      <span className="badge b-blue" style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {course.code}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{course.name}</div>
                    </td>
                    <td>
                      <span className="faint" style={{ fontSize: 13 }}>
                        {course.department?.name || 'Department'} ({course.department?.code || '—'})
                      </span>
                    </td>
                    <td>
                      <span className="badge b-gray">Sem {course.semester}</span>
                    </td>
                    <td>
                      {facultyName ? (
                        <div className="row" style={{ gap: 8 }}>
                          <span
                            className="avatar-sm"
                            style={{
                              width: 24,
                              height: 24,
                              fontSize: 11,
                              borderRadius: '50%',
                              background: '#2563eb',
                              color: '#fff',
                              display: 'inline-grid',
                              placeItems: 'center',
                            }}
                          >
                            {facultyName[0]}
                          </span>
                          <span style={{ fontSize: 13 }}>{facultyName}</span>
                        </div>
                      ) : (
                        <button
                          className="btn btn-xs btn-ghost"
                          style={{ color: '#38bdf8', border: '1px dashed rgba(56, 189, 248, 0.4)' }}
                          onClick={() => handleOpenAssign(course)}
                        >
                          <UserPlus size={12} /> Map Faculty
                        </button>
                      )}
                    </td>
                    {isSuperAdminOrAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-end" style={{ gap: 6 }}>
                          <button
                            className="btn btn-ghost icon-btn"
                            title="Assign Faculty"
                            onClick={() => handleOpenAssign(course)}
                          >
                            <UserCheck size={15} color="#38bdf8" />
                          </button>
                          <button
                            className="btn btn-ghost icon-btn"
                            title="Edit Course"
                            onClick={() => handleOpenForm(course)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="btn btn-ghost icon-btn"
                            title="Delete Course"
                            style={{ color: '#f87171' }}
                            onClick={() => {
                              setDeletingCourse(course);
                              setDeleteModalOpen(true);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add / Edit Course Modal */}
      {formOpen && (
        <Modal onClose={() => setFormOpen(false)}>
          <div className="panel modal-card" style={{ maxWidth: 520 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <BookOpen size={20} color="#38bdf8" />
                {editingCourse ? 'Edit Course' : 'Expand Curriculum - Add Course'}
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setFormOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} style={{ marginTop: 16 }}>
              <div className="form-grid">
                <Field label="Course Code *">
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="e.g. CS602"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  />
                </Field>

                <Field label="Semester *">
                  <select
                    className="select"
                    required
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 12 }}>
                <Field label="Course Title / Name *">
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="e.g. Deep Learning & Computer Vision"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </Field>
              </div>

              <div style={{ marginTop: 12 }}>
                <Field label="Academic Department *">
                  <select
                    className="select"
                    required
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 12 }}>
                <Field label="Map Faculty Instructor (Optional)">
                  <select
                    className="select"
                    value={formData.facultyId}
                    onChange={(e) => setFormData({ ...formData, facultyId: e.target.value })}
                  >
                    <option value="">No Instructor Assigned Yet</option>
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email}) — {f.role}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="row-end" style={{ gap: 10, marginTop: 24 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formBusy}>
                  {formBusy ? 'Saving...' : editingCourse ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Quick Map Faculty Modal */}
      {assignModalOpen && (
        <Modal onClose={() => setAssignModalOpen(false)}>
          <div className="panel modal-card" style={{ maxWidth: 440 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <UserCheck size={20} color="#38bdf8" /> Map Faculty to Course
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setAssignModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
              Assign an instructor for <b>{selectedCourseForAssign?.name}</b> (
              <code>{selectedCourseForAssign?.code}</code>).
            </p>

            <div style={{ marginTop: 16 }}>
              <Field label="Select Faculty / Administrator">
                <select
                  className="select"
                  value={selectedFacultyId}
                  onChange={(e) => setSelectedFacultyId(e.target.value)}
                >
                  <option value="">Choose an instructor...</option>
                  {facultyList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.email}) — {f.role}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="row-end" style={{ gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={assignBusy || !selectedFacultyId}
                onClick={handleSaveAssign}
              >
                {assignBusy ? 'Mapping...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <Modal onClose={() => setDeleteModalOpen(false)}>
          <div className="panel modal-card" style={{ maxWidth: 420 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8, color: '#f87171' }}>
                <Trash2 size={20} /> Delete Course
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setDeleteModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <p className="faint" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
              Are you sure you want to delete course{' '}
              <b>
                {deletingCourse?.name} ({deletingCourse?.code})
              </b>
              ? This action cannot be undone.
            </p>

            <div className="row-end" style={{ gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={deleteBusy} onClick={handleDeleteCourse}>
                {deleteBusy ? 'Deleting...' : 'Delete Course'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
