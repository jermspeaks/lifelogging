import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider } from "react-router";

import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import Habits from "@/routes/Habits";
import Today from "@/routes/Today";

const queryClient = new QueryClient({
  defaultOptions: {
    // Local IPC is cheap and data only changes through our own mutations.
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: false },
  },
});

// Hash router: the app is served from static files inside the Tauri bundle.
const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Today /> },
      { path: "habits", element: <Habits /> },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
