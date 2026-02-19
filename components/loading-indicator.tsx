"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LoadingIndicator = ({ className }: { className?: string }) => {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(true);
    const timer = setTimeout(() => setPending(false), 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (pending) {
    return <Loader2 className={cn("animate-spin", className)} />;
  }

  return null;
};

export default LoadingIndicator;
