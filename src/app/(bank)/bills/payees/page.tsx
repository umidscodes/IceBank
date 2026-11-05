"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/ui/api";
import { useSession } from "@/ui/session";
import { useApi } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Modal, PageHeader, Spinner, TextField } from "@/ui/components";
import { useToast } from "@/ui/toast";
import { ClassicPayees } from "@/ui/classic";
import { BillerAutocomplete } from "@/ui/payments/BillerAutocomplete";
import { describeProblem, withLabels, type Biller, type Payee } from "@/ui/payments/shared";

const LABELS = { billerId: "Biller", accountNumber: "Account number", nickname: "Nickname" };

export default function PayeesPage() {
  const { me } = useSession();
  if (me.classicView) return <ClassicPayees />;
  return <ModernPayees />;
}

function ModernPayees() {
  const toast = useToast();
  const { data: payees, error: loadError, reload } = useApi<Payee[]>("/payees");
  const [editing, setEditing] = useState<Payee | null>(null);
  const [toDelete, setToDelete] = useState<Payee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/payees/${toDelete.id}`, { method: "DELETE" });
      toast.success(`Payee ${toDelete.nickname ?? toDelete.billerName} deleted.`);
      setToDelete(null);
      reload();
    } catch (err) {
      const p = describeProblem(err);
      setDeleteError(p.message);
      toast.error(p.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Payees" subtitle="The companies you pay bills to."
        actions={<>
          <Link href="/bills" className="ib-btn ib-btn-secondary" data-testid="payees-pay-bill-link">Pay a bill</Link>
          <Link href="/bills/scheduled" className="ib-btn ib-btn-secondary" data-testid="payees-scheduled-link">Scheduled payments</Link>
        </>} />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2" testId="payees-card">
          <h2 className="font-bold text-navy text-lg mb-4">My payees</h2>
          {loadError && <Alert testId="payees-load-error">{loadError}</Alert>}
          {!payees ? (!loadError && <Spinner />) : payees.length === 0 ? <EmptyState testId="payees-empty">You have no payees yet. Add one to start paying bills.</EmptyState> : (
            <div className="overflow-x-auto">
              <table className="ib-table" data-testid="payees-table">
                <thead><tr><th>Payee</th><th>Nickname</th><th>Account number</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {payees.map((p) => (
                    <tr key={p.id} data-testid={`payee-row-${p.id}`}>
                      <td>
                        <span className="font-semibold text-navy" data-testid="payee-biller-name">{p.billerName}</span>
                        <span className="block text-xs text-muted" data-testid="payee-category">{p.category}</span>
                      </td>
                      <td data-testid="payee-nickname">{p.nickname ?? <span className="text-muted">-</span>}</td>
                      <td className="font-mono text-sm" data-testid="payee-account-number">{p.accountNumber}</td>
                      <td className="text-right whitespace-nowrap">
                        <span className="inline-flex gap-2">
                          <Link href={`/bills?payee=${p.id}`} className="ib-btn ib-btn-primary !py-1 !px-3 text-sm" data-testid={`payee-pay-${p.id}`}
                            aria-label={`Pay ${p.nickname ?? p.billerName}`}>Pay</Link>
                          <Button variant="secondary" className="!py-1 !px-3 text-sm" testId={`payee-edit-${p.id}`} aria-label={`Edit ${p.nickname ?? p.billerName}`}
                            onClick={() => setEditing(p)}>Edit</Button>
                          <Button variant="secondary" className="!py-1 !px-3 text-sm !text-alert" testId={`payee-delete-${p.id}`} aria-label={`Delete ${p.nickname ?? p.billerName}`}
                            onClick={() => { setDeleteError(null); setToDelete(p); }}>Delete</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <AddPayee onAdded={reload} />
      </div>

      {editing && <EditPayee payee={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}

      <Modal open={!!toDelete} title="Delete payee?" testId="payee-delete-modal" onClose={() => setToDelete(null)}
        footer={<>
          <Button variant="secondary" testId="payee-delete-cancel-button" onClick={() => setToDelete(null)}>Keep payee</Button>
          <Button variant="danger" testId="payee-delete-confirm-button" disabled={deleting} onClick={confirmDelete}>{deleting ? "Deleting…" : "Delete"}</Button>
        </>}>
        <p>Delete <strong data-testid="payee-delete-name">{toDelete?.nickname ?? toDelete?.billerName}</strong> (account {toDelete?.accountNumber})? Your past payments stay in your history.</p>
        {deleteError && (
          <div className="mt-3">
            <Alert testId="payee-delete-error">
              {deleteError}{" "}
              {deleteError.includes("scheduled") && <Link href="/bills/scheduled?status=SCHEDULED" className="ib-link" data-testid="payee-delete-scheduled-link">View scheduled payments</Link>}
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AddPayee({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [biller, setBiller] = useState<Biller | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!biller) fe.billerId = "Search for a biller and choose one from the list.";
    if (!accountNumber.trim()) fe.accountNumber = "Enter your account number with this biller.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setSaving(true);
    try {
      const p = await api<Payee>("/payees", { body: { billerId: biller!.id, accountNumber: accountNumber.trim(), nickname: nickname.trim() || undefined } });
      toast.success(`${p.billerName} added to your payees.`);
      setBiller(null); setAccountNumber(""); setNickname(""); setResetKey((k) => k + 1);
      onAdded();
    } catch (err) {
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, LABELS));
      setError(p.message);
      toast.error(p.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card testId="add-payee-card">
      <h2 className="font-bold text-navy mb-4">Add a payee</h2>
      {error && <div className="mb-4"><Alert testId="add-payee-error">{error}</Alert></div>}
      <form onSubmit={add} noValidate className="space-y-4" data-testid="add-payee-form">
        <BillerAutocomplete key={resetKey} value={biller} onSelect={(b) => { setBiller(b); setErrors((x) => ({ ...x, billerId: "" })); }} error={errors.billerId || undefined} />
        {biller && (
          <p className="text-sm rounded-lg bg-[#E8F2FA] text-navy px-3 py-2" data-testid="selected-biller">
            <strong data-testid="selected-biller-name">{biller.name}</strong> · <span data-testid="selected-biller-category">{biller.category}</span>
          </p>
        )}
        <TextField id="accountNumber" label="Account number" autoComplete="off" maxLength={30} testId="payee-account-number-input" value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)} error={errors.accountNumber} disabled={!biller}
          help={biller ? `Format: ${biller.accountNumberHint}` : "Choose a biller first. It is on your bill."} />
        <TextField id="nickname" label="Nickname (optional)" maxLength={30} autoComplete="off" testId="payee-nickname-input" value={nickname}
          onChange={(e) => setNickname(e.target.value)} error={errors.nickname} help="1 to 30 characters, e.g. Cottage hydro." />
        <Button type="submit" testId="add-payee-button" disabled={saving}>{saving ? "Adding…" : "Add payee"}</Button>
      </form>
    </Card>
  );
}

function EditPayee({ payee, onClose, onSaved }: { payee: Payee; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [accountNumber, setAccountNumber] = useState(payee.accountNumber);
  const [nickname, setNickname] = useState(payee.nickname ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!accountNumber.trim()) { setErrors({ accountNumber: "Enter the account number." }); return; }
    setSaving(true);
    setError(null);
    try {
      await api<Payee>(`/payees/${payee.id}`, { method: "PUT", body: { accountNumber: accountNumber.trim(), nickname: nickname.trim() || null } });
      toast.success("Payee updated.");
      onSaved();
    } catch (err) {
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, LABELS));
      setError(p.message);
      toast.error(p.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`Edit ${payee.billerName}`} testId="payee-edit-modal" onClose={onClose}
      footer={<>
        <Button variant="secondary" testId="payee-edit-cancel-button" onClick={onClose}>Cancel</Button>
        <Button testId="payee-edit-save-button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</Button>
      </>}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="payee-edit-form">
        {error && <Alert testId="payee-edit-error">{error}</Alert>}
        <TextField id="editAccountNumber" label="Account number" maxLength={30} autoComplete="off" testId="payee-edit-account-number-input" value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)} error={errors.accountNumber} />
        <TextField id="editNickname" label="Nickname (optional)" maxLength={30} autoComplete="off" testId="payee-edit-nickname-input" value={nickname}
          onChange={(e) => setNickname(e.target.value)} error={errors.nickname} help="Leave empty to remove the nickname." />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
