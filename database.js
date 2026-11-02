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
export async function saveReceipt(record, imageFile) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Kailangan munang mag-login.");

  const imagePath = await uploadReceiptImage(imageFile);
  const row = {
    payment_method: record.method,
    amount: Number(record.amount),
    reference_number: record.reference,
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
    // Remove orphan image if DB insert failed.
    await supabase.storage.from(RECEIPT_BUCKET).remove([imagePath]);
    if (error.code === "23505") throw new Error("May kaparehong reference number na para sa payment method na ito.");
    throw error;
  }
  return data;
}
export async function getReceipts(searchText = "") {
  let query = supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(200);
  const { data, error } = await query;
  if (error) throw error;
  const q = searchText.trim().toLowerCase();
  return (data || []).filter(r =>
    `${r.reference_number} ${r.payment_method} ${r.amount}`.toLowerCase().includes(q)
  );
}
export async function getReceiptImageUrl(path) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
