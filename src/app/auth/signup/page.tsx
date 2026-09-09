import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignupWizard } from "@/components/SignupWizard";

export const metadata: Metadata = {
  title: "Create your Beanie Xchange account",
  description:
    "Create a free Beanie Xchange account to buy and sell authenticated Beanie Babies, submit items for authentication, and access the BX Registry.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return <SignupWizard />;
}
