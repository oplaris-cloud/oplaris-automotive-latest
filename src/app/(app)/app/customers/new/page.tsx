import { requireManager } from "@/lib/auth/session";
import { PageContainer } from "@/components/app/page-container";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  await requireManager();

  return (
    <PageContainer width="form">
      <h1 className="text-2xl font-semibold">Add Customer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the customer&apos;s details. Phone number is required.
      </p>
      <NewCustomerForm />
    </PageContainer>
  );
}
