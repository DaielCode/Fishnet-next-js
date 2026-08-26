/**
 * Do przechowywania zdjęć postów wybrałem Cloudinary, a nie Firebase Storage,
 * z którego korzystałem na początku. Powód: Firebase Storage w pewnym momencie
 * zaczął wymagać podpięcia płatnego planu Blaze — nawet gdybym mieścił się
 * w darmowym limicie, i tak musiałbym podać kartę płatniczą, a to było dla
 * mnie niedopuszczalne w projekcie, który miał zostać w pełni darmowy.
 * Cloudinary daje 10GB za darmo bez żadnej karty, więc było to naturalne
 * rozwiązanie zastępcze — wystarczyło podmienić miejsce uploadu zdjęć.
 *
 * Świadomie zdecydowałem się na upload "unsigned" (przez `upload_preset`)
 * zamiast podpisywanego requestu — to pozwala wysyłać plik bezpośrednio
 * z przeglądarki, bez trzymania sekretnego klucza API po stronie klienta.
 * Konsekwencją tego wyboru jest to, że nie mogę bezpiecznie usuwać zdjęć
 * z Cloudinary bez własnego serwera (do podpisania takiego żądania
 * potrzebny byłby sekret) — dlatego w PostCard.tsx usunięcie posta kasuje
 * tylko wpis z bazy, a zdjęcie zostaje na koncie Cloudinary.
 */
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
