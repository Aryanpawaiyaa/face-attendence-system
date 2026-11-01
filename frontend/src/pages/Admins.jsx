import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { del, errMsg, get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { Empty, Field, Modal, PageHead, Pager, Spinner, useToast } from '../components/UI';

const EMPTY_ADMIN = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'ADMIN',
  password: '',
  status: 'ACTIVE',
};

export default function Admins() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState(EMPTY_ADMIN);
  const [formBusy, setFormBusy] = useState(false);

  // Temporary password display modal
  const [createdPasswordInfo, setCreatedPasswordInfo] = useState(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Fetch Admins list
  const { data: adminData, loading, mutate } = useFetch(
    `/admins?${new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search: search.trim() } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
    }).toString()}`
  );

  const admins = adminData?.items || [];
  const pagination = adminData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Open Add/Edit Modal
  const handleOpenForm = (admin = null) => {
    setEditingAdmin(admin);
    if (admin) {
      setFormData({
        firstName: admin.firstName || '',
        lastName: admin.lastName || '',
        email: admin.email || '',
        phone: admin.phone || '',
        role: admin.role || 'ADMIN',
        status: admin.status || 'ACTIVE',
        password: '',
      });
    } else {
      setFormData(EMPTY_ADMIN);
    }
    setFormOpen(true);
  };

  // Submit Admin Form
  const handleSaveAdmin = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    try {
      if (editingAdmin) {
        const payload = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone.trim() || undefined,
          role: formData.role,
          status: formData.status,
          ...(formData.password ? { password: formData.password } : {}),
        };
        await put(`/admins/${editingAdmin.id}`, payload);
        toast('Administrator updated successfully', 'success');
        setFormOpen(false);
      } else {
        const payload = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim() || undefined,
          role: formData.role,
          ...(formData.password ? { password: formData.password } : {}),
        };
        const res = await post('/admins', payload);
        toast('Administrator created successfully', 'success');
        setFormOpen(false);

        if (res.temporaryPassword) {
          setCreatedPasswordInfo({
            name: `${payload.firstName} ${payload.lastName}`,
            email: payload.email,
            password: res.temporaryPassword,
          });
        }
      }
      mutate();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setFormBusy(false);
    }
  };

  // Delete Admin
  const handleDeleteAdmin = async () => {
    if (!deletingAdmin) return;
    setDeleteBusy(true);
    try {
      await del(`/admins/${deletingAdmin.id}`);
      toast('Administrator account removed', 'success');
      setDeleteModalOpen(false);
      mutate();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const superAdminsCount = admins.filter((a) => a.role === 'SUPER_ADMIN').length;
  const activeAdminsCount = admins.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="admins-page">
      <PageHead
        title="Administrator Management"
        subtitle="Full lifecycle CRUD management of system administrators, privilege assignment, and account security."
        actions={
          <button className="btn btn-primary" onClick={() => handleOpenForm()}>
            <UserPlus size={16} /> Add Administrator
          </button>
        }
      />

      {/* Stat Cards */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="panel stat-card">
          <div className="stat-label">Total Administrators</div>
          <div className="stat-value">{pagination.total || admins.length}</div>
          <div className="stat-sub">Administrative users</div>
        </div>
        <div className="panel stat-card">
          <div className="stat-label">Super Administrators</div>
          <div className="stat-value">{superAdminsCount}</div>
          <div className="stat-sub">Full system privilege</div>
        </div>
        <div className="panel stat-card">
          <div className="stat-label">Active Status</div>
          <div className="stat-value">{activeAdminsCount}</div>
          <div className="stat-sub">Operational accounts</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="panel filter-bar" style={{ marginBottom: 18 }}>
        <div className="row grow" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="search-input grow" style={{ minWidth: 240 }}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="input"
              placeholder="Search admin by name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="select"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 200 }}
          >
            <option value="">All Administrator Roles</option>
            <option value="SUPER_ADMIN">Super Admins Only</option>
            <option value="ADMIN">Standard Admins</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <Spinner size={32} />
        </div>
      ) : admins.length === 0 ? (
        <Empty
          title="No administrators found"
          description={
            search || roleFilter
              ? 'Try modifying your filter parameters.'
              : 'Add new administrators to delegate system management.'
          }
          action={
            <button className="btn btn-primary btn-sm" onClick={() => handleOpenForm()}>
              <Plus size={14} /> Add Administrator
            </button>
          }
        />
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Contact Info</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th style={{ textAlign: 'right', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((adm) => {
                const isSelf = adm.id === currentUser?.id;
                const isSuper = adm.role === 'SUPER_ADMIN';

                return (
                  <tr key={adm.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span
                          className="avatar"
                          style={{
                            width: 34,
                            height: 34,
                            fontSize: 14,
                            background: isSuper ? '#7c3aed' : '#2563eb',
                            color: '#fff',
                            borderRadius: '50%',
                            display: 'inline-grid',
                            placeItems: 'center',
                          }}
                        >
                          {(adm.firstName || '?')[0]}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {adm.firstName} {adm.lastName}
                            {isSelf && (
                              <span
                                className="badge b-blue"
                                style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px' }}
                              >
                                You
                              </span>
                            )}
                          </div>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {adm.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{adm.phone || '—'}</div>
                    </td>
                    <td>
                      <span className={`badge ${isSuper ? 'b-purple' : 'b-blue'}`}>
                        {isSuper ? <ShieldCheck size={12} /> : <Shield size={12} />}
                        {isSuper ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          adm.status === 'ACTIVE'
                            ? 'b-green'
                            : adm.status === 'SUSPENDED'
                            ? 'b-red'
                            : 'b-gray'
                        }`}
                      >
                        <span
                          className={`dot ${adm.status === 'ACTIVE' ? 'pulse' : ''}`}
                          style={{
                            background:
                              adm.status === 'ACTIVE'
                                ? '#22c55e'
                                : adm.status === 'SUSPENDED'
                                ? '#ef4444'
                                : '#94a3b8',
                          }}
                        />
                        {adm.status}
                      </span>
                    </td>
                    <td>
                      <span className="faint" style={{ fontSize: 12 }}>
                        {fmtDate(adm.createdAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-end" style={{ gap: 6 }}>
                        <button
                          className="btn btn-ghost icon-btn"
                          title="Edit Administrator"
                          onClick={() => handleOpenForm(adm)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn btn-ghost icon-btn"
                          title={isSelf ? 'Cannot delete yourself' : 'Delete Administrator'}
                          style={{
                            color: isSelf ? '#64748b' : '#f87171',
                            cursor: isSelf ? 'not-allowed' : 'pointer',
                          }}
                          disabled={isSelf}
                          onClick={() => {
                            if (!isSelf) {
                              setDeletingAdmin(adm);
                              setDeleteModalOpen(true);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
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

      {/* Add / Edit Admin Modal */}
      {formOpen && (
        <Modal onClose={() => setFormOpen(false)}>
          <div className="panel modal-card" style={{ maxWidth: 500 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8 }}>
                <ShieldCheck size={20} color="#38bdf8" />
                {editingAdmin ? 'Edit Administrator' : 'Create Administrator Account'}
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setFormOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAdmin} style={{ marginTop: 16 }}>
              <div className="form-grid">
                <Field label="First Name *">
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="e.g. John"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </Field>

                <Field label="Last Name *">
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="e.g. Doe"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </Field>
              </div>

              {!editingAdmin && (
                <div style={{ marginTop: 12 }}>
                  <Field label="Email Address *">
                    <input
                      type="email"
                      className="input"
                      required
                      placeholder="e.g. admin@faceattend.org"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </Field>
                </div>
              )}

              <div className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Phone Number (Optional)">
                  <input
                    type="tel"
                    className="input"
                    placeholder="e.g. +91 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </Field>

                <Field label="Role Level *">
                  <select
                    className="select"
                    required
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="ADMIN">Admin (Standard)</option>
                    <option value="SUPER_ADMIN">Super Admin (Full Root Access)</option>
                  </select>
                </Field>
              </div>

              {editingAdmin && (
                <div style={{ marginTop: 12 }}>
                  <Field label="Account Status *">
                    <select
                      className="select"
                      required
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </Field>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <Field
                  label={
                    editingAdmin
                      ? 'Reset Password (Leave blank to keep current)'
                      : 'Initial Password (Leave blank to auto-generate temporary password)'
                  }
                >
                  <input
                    type="password"
                    className="input"
                    minLength={6}
                    placeholder={editingAdmin ? '••••••••' : 'Auto-generated if empty'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row-end" style={{ gap: 10, marginTop: 24 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formBusy}>
                  {formBusy ? 'Saving...' : editingAdmin ? 'Save Changes' : 'Create Administrator'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Temporary Password Display Modal */}
      {createdPasswordInfo && (
        <Modal onClose={() => setCreatedPasswordInfo(null)}>
          <div className="panel modal-card" style={{ maxWidth: 440 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8, color: '#34d399' }}>
                <CheckCircle size={20} /> Administrator Created
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setCreatedPasswordInfo(null)}>
                <X size={16} />
              </button>
            </div>

            <p className="faint" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
              Account for <b>{createdPasswordInfo.name}</b> has been generated with email{' '}
              <code>{createdPasswordInfo.email}</code>.
            </p>

            <div
              style={{
                marginTop: 16,
                padding: '14px 16px',
                background: 'rgba(52, 211, 153, 0.08)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                borderRadius: 8,
              }}
            >
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Temporary Access Password
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 18,
                  fontWeight: 700,
                  marginTop: 6,
                  color: '#34d399',
                  userSelect: 'all',
                }}
              >
                {createdPasswordInfo.password}
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
                Share this password securely with the administrator. It will not be shown again.
              </div>
            </div>

            <div className="row-end" style={{ marginTop: 22 }}>
              <button className="btn btn-primary" onClick={() => setCreatedPasswordInfo(null)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Admin Modal */}
      {deleteModalOpen && (
        <Modal onClose={() => setDeleteModalOpen(false)}>
          <div className="panel modal-card" style={{ maxWidth: 420 }}>
            <div className="row-between">
              <h3 className="row" style={{ gap: 8, color: '#f87171' }}>
                <AlertTriangle size={20} /> Remove Administrator
              </h3>
              <button className="btn btn-ghost icon-btn" onClick={() => setDeleteModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <p className="faint" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
              Are you sure you want to remove administrator{' '}
              <b>
                {deletingAdmin?.firstName} {deletingAdmin?.lastName}
              </b>{' '}
              (<code>{deletingAdmin?.email}</code>)?
            </p>

            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 8,
                fontSize: 12,
                color: '#f87171',
              }}
            >
              This account will lose all system access and active login sessions will be immediately revoked.
            </div>

            <div className="row-end" style={{ gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={deleteBusy} onClick={handleDeleteAdmin}>
                {deleteBusy ? 'Deleting...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
