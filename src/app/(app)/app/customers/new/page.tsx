import { requireManagerOrTester } from "@/lib/auth/session";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  await requireManagerOrTester();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Add Customer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the customer&apos;s details. Phone number is required.
      </p>
      <NewCustomerForm />
    </div>
  );
}
