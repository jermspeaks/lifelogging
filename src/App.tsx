import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider } from "react-router";

import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import Calendar from "@/routes/Calendar";
import Habits from "@/routes/Habits";
import Goals from "@/routes/Goals";
import Journal from "@/routes/Journal";
import Notes from "@/routes/Notes";
import Reminders from "@/routes/Reminders";
import Quotes from "@/routes/Quotes";
import Settings from "@/routes/Settings";
import Themes from "@/routes/Themes";
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
      { path: "calendar", element: <Calendar /> },
      { path: "journal", element: <Journal /> },
      { path: "reminders", element: <Reminders /> },
      { path: "goals", element: <Goals /> },
      { path: "notes", element: <Notes /> },
      { path: "themes", element: <Themes /> },
      { path: "quotes", element: <Quotes /> },
      { path: "settings", element: <Settings /> },
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
