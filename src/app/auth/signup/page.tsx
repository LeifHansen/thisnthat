import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignupWizard } from "@/components/SignupWizard";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Create your ${SITE_NAME} account`,
  description: `Create a free ${SITE_NAME} account to buy and sell almost anything. Payments are held until delivery, so every sale is protected.`,
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <SignupWizard />;
}
