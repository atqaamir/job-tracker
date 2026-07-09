"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full bg-zinc-300 outline-none transition-colors data-[state=checked]:bg-zinc-900 dark:bg-zinc-700 dark:data-[state=checked]:bg-zinc-100",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 dark:bg-zinc-900" />
    </SwitchPrimitive.Root>
  );
}
