import { redirect } from "next/navigation";

/**
 * Root path. Auth-aware redirect lives in U1 (login flow). For now we
 * point staff at /app and customers will arrive directly at /status from
 * the deep-linked SMS.
 */
export default function RootPage(): never {
  redirect("/app");
}
