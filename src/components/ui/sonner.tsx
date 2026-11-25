import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isDemo: authIsDemo } = useAuth();
  const isDemo = authIsDemo || pathname.startsWith("/demo");

  useEffect(() => {
    if (isDemo) {
      toast.dismiss();
    }
  }, [isDemo]);

  if (isDemo) {
    return null;
  }

  return (
    <Sonner
      position="bottom-center"
      offset={16}
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:w-auto group-[.toaster]:min-w-[320px] group-[.toaster]:max-w-[min(680px,92vw)] group-[.toaster]:flex-row group-[.toaster]:items-center group-[.toaster]:gap-3",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
