/**
 * The storage proof: the page's claim that expenses survive a reload is earned, not assumed.
 *
 * Each visit records a marker in the database through this module. A later visit that reads a
 * marker back has demonstrated that rows written before a reload really survive in the store
 * this load opened — the browser's own IndexedDB, since that is the only thing an open can
 * produce here. On a first visit there is no marker yet, so there is nothing to claim.
 */
import { database } from "@/lib/db";

const PROOF_KEY = "storage-proof";

/** True when a marker left by an earlier visit reads back from the database this visit opened. */
export async function readStorageProof(): Promise<boolean> {
  const table = (await database.ready()).meta;
  return (await table.get(PROOF_KEY)) !== undefined;
}

/** Records that this visit opened the database, so the next visit can check its survival. */
export async function writeStorageProof(): Promise<void> {
  const table = (await database.ready()).meta;
  const previous = await table.get(PROOF_KEY);
  await table.put({ key: PROOF_KEY, session: (previous?.session ?? 0) + 1 });
  // Verify the marker landed, matching how expense writes are checked.
  if (!(await table.get(PROOF_KEY))) {
    throw new Error("The storage check could not be recorded.");
  }
}
