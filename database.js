import { supabase } from "./supabase.js";
import { RECEIPT_BUCKET } from "./config.js";

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
export async function uploadReceiptImage(fileOrBlob) {
  const ext = (fileOrBlob.type || "image/jpeg").split("/")[1] || "jpg";
  const path = `${crypto.randomUUID()}.${safeFileName(ext)}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, fileOrBlob, {
    contentType: fileOrBlob.type || "image/jpeg",
    upsert: false
  });
  if (error) throw error;
  return path;
}
export async function findDuplicateReceipt(method, reference) {
  const normalized = String(reference || "").trim();
  if (!normalized) return null;
  const escaped = normalized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const { data, error } = await supabase.from("receipts")
    .select("id,payment_method,reference_number,amount,transaction_date,created_at")
    .ilike("payment_method", String(method || "").trim())
    .ilike("reference_number", escaped)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function saveReceipt(record, imageFile) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Kailangan munang mag-login.");

  const duplicate = await findDuplicateReceipt(record.method, record.reference);
  if (duplicate) throw new Error(`DUPLICATE_RECEIPT: May na-save nang ${record.method} reference ${record.reference}. Hindi ito in-upload ulit.`);

  const imagePath = await uploadReceiptImage(imageFile);
  const row = {
    payment_method: record.method,
    customer_name: String(record.customerName || "").trim(),
    amount: Number(record.amount),
    reference_number: String(record.reference).trim(),
    transaction_date: record.txDate || null,
    transaction_time: record.txTime || null,
    receipt_image_path: imagePath,
    ocr_raw_text: record.rawText || null,
    staff_name: record.staffName,
    shift_code: record.shiftCode,
    created_by: authData.user.id
  };
  const { data, error } = await supabase.from("receipts").insert(row).select().single();
  if (error) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([imagePath]);
    if (error.code === "23505") throw new Error("DUPLICATE_RECEIPT: May kaparehong reference number na para sa payment method na ito.");
    throw error;
  }
  return data;
}
export async function getReceipts(searchText = "") {
  const pageSize = 500;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase.from("receipts").select("*")
      .order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  const q = String(searchText || "").trim().toLowerCase();
  return q ? all.filter(r => `${r.reference_number} ${r.payment_method} ${r.amount} ${r.staff_name || ""}`.toLowerCase().includes(q)) : all;
}

export async function deleteReceipt(record) {
  if (!record?.id) throw new Error("Walang receipt ID.");
  const { error } = await supabase.from("receipts").delete().eq("id", record.id);
  if (error) throw error;
  if (record.receipt_image_path) {
    const { error: storageError } = await supabase.storage.from(RECEIPT_BUCKET).remove([record.receipt_image_path]);
    if (storageError) throw new Error("Na-delete ang record pero hindi ang image file: " + storageError.message);
  }
  return true;
}
export async function getReceiptImageUrl(path) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
