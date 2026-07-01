import { redirect } from "next/navigation";
import { getSellerStoreOrNull } from "@/lib/seller";

// "View storefront" tab: send the seller to their public store page, or to the
// customize page if they haven't created a store yet.
export default async function StorefrontRedirect() {
  const store = await getSellerStoreOrNull();
  if (!store) redirect("/sell/store");
  redirect(`/store/${store.slug}`);
}
