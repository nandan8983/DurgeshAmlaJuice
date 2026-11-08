/**
 * Plan and price management. Editing a price only affects subscriptions created
 * afterwards — existing ones keep the amount snapshotted when they were sold.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { rupees } from '../lib/format';
import { Alert, Badge, Card, ErrorNote, Field, Loading, Modal, ProductBadge } from '../components/ui';
import { useAuth } from '../store/auth';

export function PlansPage(): React.JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const isAdmin = user?.role === 'admin';
  const plans = useQuery({ queryKey: ['plans', 'all'], queryFn: () => api.plans(true) });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.updatePlan(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      setDrafts({});
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plans &amp; prices</h1>
          <p>
            Price is for one bottle a day across the whole plan. A customer on 2 bottles a day pays
            twice the listed price.
          </p>
        </div>
        {isAdmin ? (
          <button type="button" onClick={() => setAdding(true)}>
            Add plan
          </button>
        ) : null}
      </div>

      {!isAdmin ? <Alert tone="info">Only an admin can change prices.</Alert> : null}
      {update.isError ? <ErrorNote error={update.error} /> : null}
      {update.isSuccess ? <Alert tone="info">Saved. New subscriptions use the new price.</Alert> : null}

      <Card>
        {plans.isLoading ? <Loading what="plans" /> : null}
        {plans.isError ? <ErrorNote error={plans.error} /> : null}
        {plans.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Product</th>
                  <th className="num">Days</th>
                  <th className="num">Price (1 bottle/day)</th>
                  <th className="num">Per day</th>
                  <th>Flags</th>
                  {isAdmin ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {plans.data.plans.map(plan => {
                  const draft = drafts[plan.id];
                  return (
                    <tr key={plan.id}>
                      <td>{plan.name}</td>
                      <td>
                        <ProductBadge product={plan.product} />
                      </td>
                      <td className="num">{plan.durationDays}</td>
                      <td className="num">
                        {isAdmin ? (
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={draft ?? String(plan.price)}
                            onChange={event =>
                              setDrafts({ ...drafts, [plan.id]: event.target.value })
                            }
                            style={{ width: 110, textAlign: 'right' }}
                          />
                        ) : (
                          rupees(plan.price)
                        )}
                      </td>
                      <td className="num">{rupees(plan.perDay)}</td>
                      <td>
                        <div className="row" style={{ gap: '0.3rem' }}>
                          {plan.isTrial ? <Badge tone="amber">trial</Badge> : null}
                          {plan.isActive ? (
                            <Badge tone="green">active</Badge>
                          ) : (
                            <Badge tone="grey">hidden</Badge>
                          )}
                        </div>
                      </td>
                      {isAdmin ? (
                        <td>
                          <div className="row">
                            <button
                              type="button"
                              className="small"
                              disabled={
                                draft === undefined ||
                                draft === String(plan.price) ||
                                Number.isNaN(Number(draft)) ||
                                update.isPending
                              }
                              onClick={() =>
                                update.mutate({ id: plan.id, patch: { price: Number(draft) } })
                              }>
                              Save price
                            </button>
                            <button
                              type="button"
                              className="small secondary"
                              onClick={() =>
                                update.mutate({ id: plan.id, patch: { isActive: !plan.isActive } })
                              }>
                              {plan.isActive ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {adding ? <AddPlanModal onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function AddPlanModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    product: 'amla' as 'amla' | 'beetroot' | 'combo',
    durationDays: 30,
    price: 0,
    isTrial: false,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createPlan({
        name: form.name,
        product: form.product,
        durationDays: Number(form.durationDays),
        price: Number(form.price),
        isTrial: form.isTrial,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      onClose();
    },
  });

  return (
    <Modal title="Add a plan" onClose={onClose}>
      {create.isError ? <ErrorNote error={create.error} /> : null}
      <Alert tone="info">One plan per product and duration combination.</Alert>

      <Field label="Name">
        <input
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Amla 45-day"
        />
      </Field>
      <Field label="Product">
        <select
          value={form.product}
          onChange={e =>
            setForm({ ...form, product: e.target.value as 'amla' | 'beetroot' | 'combo' })
          }>
          <option value="amla">Amla</option>
          <option value="beetroot">Beetroot</option>
          <option value="combo">Combo (alternating)</option>
        </select>
      </Field>
      <Field label="Duration (days)">
        <input
          type="number"
          min={1}
          max={366}
          value={form.durationDays}
          onChange={e => setForm({ ...form, durationDays: Number(e.target.value) })}
        />
      </Field>
      <Field label="Price for one bottle a day (₹)">
        <input
          type="number"
          min={0}
          value={form.price}
          onChange={e => setForm({ ...form, price: Number(e.target.value) })}
        />
      </Field>
      <Field label="Trial plan">
        <label style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={form.isTrial}
            onChange={e => setForm({ ...form, isTrial: e.target.checked })}
            style={{ width: 'auto', minHeight: 0, marginRight: '0.4rem' }}
          />
          Mark as a trial
        </label>
      </Field>

      <div className="row end">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || form.name.trim().length < 2}>
          {create.isPending ? 'Saving…' : 'Add plan'}
        </button>
      </div>
    </Modal>
  );
}
