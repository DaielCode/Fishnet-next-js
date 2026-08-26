export async function uploadToCloudinary(plik: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", plik);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Błąd uploadu zdjęcia");
  const data = await res.json();
  return data.secure_url as string;
}
