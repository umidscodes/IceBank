"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/ui/api";
import { useApi } from "@/ui/types";
import { Alert, Button, Card, EmptyState, Modal, PageHeader, Spinner, TextField } from "@/ui/components";
import { useToast } from "@/ui/toast";
import { describeProblem, withLabels, type Contact } from "@/ui/payments/shared";

const LABELS = { name: "Name", email: "Email" };
const MAX_CONTACTS = 50;

export default function ContactsPage() {
  const toast = useToast();
  const { data: contacts, error: loadError, reload } = useApi<Contact[]>("/etransfer-contacts");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEdit(c: Contact) {
    setEditing(c); setName(c.name); setEmail(c.email); setErrors({}); setError(null);
    document.getElementById("contactName")?.focus();
  }
  function resetForm() {
    setEditing(null); setName(""); setEmail(""); setErrors({}); setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = "Enter the contact's name.";
    if (!email.trim()) fe.email = "Enter the contact's email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = "Enter a valid email address.";
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), email: email.trim() };
      const c = editing
        ? await api<Contact>(`/etransfer-contacts/${editing.id}`, { method: "PUT", body })
        : await api<Contact>("/etransfer-contacts", { body });
      toast.success(editing ? `Contact ${c.name} updated.` : `Contact ${c.name} added.`);
      resetForm();
      reload();
    } catch (err) {
      const p = describeProblem(err);
      setErrors(withLabels(p.fields, LABELS));
      setError(p.message);
      toast.error(p.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/etransfer-contacts/${toDelete.id}`, { method: "DELETE" });
      toast.success(`Contact ${toDelete.name} deleted.`);
      if (editing?.id === toDelete.id) resetForm();
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
      <PageHeader title="e-Transfer contacts" subtitle={`Save the people you send money to. Up to ${MAX_CONTACTS} contacts.`}
        actions={<Link href="/etransfer" className="ib-btn ib-btn-secondary" data-testid="contacts-send-link">Send an e-Transfer</Link>} />
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2" testId="contacts-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-navy text-lg">My contacts</h2>
            {contacts && <span className="text-sm text-muted" data-testid="contacts-count">{contacts.length} of {MAX_CONTACTS}</span>}
          </div>
          {loadError && <Alert testId="contacts-load-error">{loadError}</Alert>}
          {!contacts ? (!loadError && <Spinner />) : contacts.length === 0 ? <EmptyState testId="contacts-empty">You have no saved contacts yet.</EmptyState> : (
            <div className="overflow-x-auto">
              <table className="ib-table" data-testid="contacts-table">
                <thead><tr><th>Name</th><th>Email</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} data-testid={`contact-row-${c.id}`} className={editing?.id === c.id ? "bg-[#F3F8FC]" : ""}>
                      <td className="font-semibold text-navy" data-testid="contact-name">{c.name}</td>
                      <td data-testid="contact-email">{c.email}</td>
                      <td className="text-right whitespace-nowrap">
                        <span className="inline-flex gap-2">
                          <Link href={`/etransfer?contact=${c.id}`} className="ib-btn ib-btn-secondary !py-1 !px-3 text-sm" data-testid={`contact-send-${c.id}`}
                            aria-label={`Send money to ${c.name}`}>Send</Link>
                          <Button variant="secondary" className="!py-1 !px-3 text-sm" testId={`contact-edit-${c.id}`} aria-label={`Edit ${c.name}`} onClick={() => startEdit(c)}>Edit</Button>
                          <Button variant="secondary" className="!py-1 !px-3 text-sm !text-alert" testId={`contact-delete-${c.id}`} aria-label={`Delete ${c.name}`}
                            onClick={() => { setDeleteError(null); setToDelete(c); }}>Delete</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card testId="contact-form-card">
          <h2 className="font-bold text-navy mb-4" data-testid="contact-form-title">{editing ? `Edit ${editing.name}` : "Add a contact"}</h2>
          {error && <div className="mb-4"><Alert testId="contact-form-error">{error}</Alert></div>}
          <form onSubmit={save} noValidate className="space-y-4" data-testid="contact-form">
            <TextField id="contactName" label="Name" maxLength={60} autoComplete="off" testId="contact-name-input" value={name}
              onChange={(e) => setName(e.target.value)} error={errors.name} />
            <TextField id="contactEmail" label="Email" type="email" maxLength={254} autoComplete="off" testId="contact-email-input" value={email}
              onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            <div className="flex gap-2">
              <Button type="submit" testId="contact-save-button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add contact"}</Button>
              {editing && <Button variant="secondary" testId="contact-cancel-edit-button" onClick={resetForm}>Cancel</Button>}
            </div>
          </form>
        </Card>
      </div>
      <Modal open={!!toDelete} title="Delete contact?" testId="contact-delete-modal" onClose={() => setToDelete(null)}
        footer={<>
          <Button variant="secondary" testId="contact-delete-cancel-button" onClick={() => setToDelete(null)}>Keep contact</Button>
          <Button variant="danger" testId="contact-delete-confirm-button" disabled={deleting} onClick={confirmDelete}>{deleting ? "Deleting…" : "Delete"}</Button>
        </>}>
        <p>Delete <strong data-testid="contact-delete-name">{toDelete?.name}</strong> ({toDelete?.email}) from your contacts? e-Transfers you already sent are not affected.</p>
        {deleteError && <div className="mt-3"><Alert testId="contact-delete-error">{deleteError}</Alert></div>}
      </Modal>
    </div>
  );
}
