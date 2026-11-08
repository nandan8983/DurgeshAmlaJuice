/** Riders and supervisors: create, activate/deactivate, assign riders to supervisors. */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { shortDate } from '../lib/format';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal } from '../components/ui';
import { useAuth } from '../store/auth';
import type { Role } from '../lib/types';

export function TeamPage(): React.JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api.users() });
  const supervisors = (users.data?.users ?? []).filter(u => u.role === 'supervisor');

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.updateUser(id, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Riders &amp; supervisors</h1>
          <p>
            {user?.role === 'supervisor'
              ? 'Your own riders. Only an admin can move a rider to another supervisor.'
              : 'Everyone with a login. Riders are grouped under a supervisor.'}
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)}>
          Add {user?.role === 'supervisor' ? 'rider' : 'user'}
        </button>
      </div>

      {update.isError ? <ErrorNote error={update.error} /> : null}
      {users.isLoading ? <Loading what="team" /> : null}
      {users.isError ? <ErrorNote error={users.error} /> : null}

      {users.data ? (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Role</th>
                  <th>Supervisor</th>
                  <th className="num">Customers</th>
                  <th>Since</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data.users.map(member => (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td>{member.mobile}</td>
                    <td>
                      <Badge tone={member.role === 'admin' ? 'magenta' : member.role === 'supervisor' ? 'amber' : 'green'}>
                        {member.role}
                      </Badge>
                    </td>
                    <td>
                      {member.role === 'rider' && user?.role === 'admin' ? (
                        <select
                          value={member.supervisorId ?? ''}
                          onChange={event =>
                            update.mutate({
                              id: member.id,
                              patch: { supervisorId: event.target.value || null },
                            })
                          }
                          style={{ minWidth: 150 }}>
                          <option value="">Unassigned</option>
                          {supervisors.map(supervisor => (
                            <option key={supervisor.id} value={supervisor.id}>
                              {supervisor.name}
                            </option>
                          ))}
                        </select>
                      ) : member.role === 'rider' ? (
                        (supervisors.find(s => s.id === member.supervisorId)?.name ?? '—')
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{member.customerCount}</td>
                    <td>{shortDate(member.createdAt)}</td>
                    <td>
                      {member.isActive ? (
                        <Badge tone="green">active</Badge>
                      ) : (
                        <Badge tone="red">disabled</Badge>
                      )}
                    </td>
                    <td>
                      {member.id === user?.id ? (
                        <span className="muted">you</span>
                      ) : (
                        <button
                          type="button"
                          className="small secondary"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({ id: member.id, patch: { isActive: !member.isActive } })
                          }>
                          {member.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Deactivating a rider blocks their login immediately. Their customers stay put — reassign
            them from the Customers page.
          </p>
        </Card>
      ) : null}

      {adding ? (
        <AddUserModal
          onClose={() => setAdding(false)}
          canChooseRole={user?.role === 'admin'}
          supervisors={supervisors.map(s => ({ id: s.id, name: s.name }))}
        />
      ) : null}
    </>
  );
}

function AddUserModal({
  onClose,
  canChooseRole,
  supervisors,
}: {
  onClose: () => void;
  canChooseRole: boolean;
  supervisors: Array<{ id: string; name: string }>;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    password: '',
    role: 'rider' as Role,
    supervisorId: '',
  });

  const create = useMutation({
    mutationFn: () =>
      api.createUser({
        name: form.name,
        mobile: form.mobile,
        email: form.email || undefined,
        password: form.password,
        role: form.role,
        supervisorId: form.role === 'rider' ? form.supervisorId || null : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal title="Add a login" onClose={onClose}>
      {create.isError ? <ErrorNote error={create.error} /> : null}
      <Alert tone="info">
        Give the password to the person directly; they can change it from the app or dashboard.
      </Alert>

      <Field label="Name">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Mobile (this is the username)">
        <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
      </Field>
      <Field label="Email (optional)">
        <input
          type="email"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <input
          type="text"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
        />
      </Field>
      {canChooseRole ? (
        <Field label="Role">
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as Role })}>
            <option value="rider">Rider</option>
            <option value="supervisor">Supervisor / reseller</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
      ) : null}
      {form.role === 'rider' ? (
        <Field label="Supervisor">
          <select
            value={form.supervisorId}
            onChange={e => setForm({ ...form, supervisorId: e.target.value })}>
            <option value="">Unassigned</option>
            {supervisors.map(supervisor => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="row end">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={
            create.isPending ||
            form.name.trim().length < 2 ||
            form.mobile.trim().length < 6 ||
            form.password.length < 8
          }>
          {create.isPending ? 'Creating…' : 'Create login'}
        </button>
      </div>
    </Modal>
  );
}
