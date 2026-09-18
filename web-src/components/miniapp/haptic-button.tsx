"use client"

import React from "react"
import { hapticTap } from "@/lib/webapp"
import { cn } from "@/lib/utils"

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  haptic?: boolean
};

/** Единая кнопка с вибрацией: чинит "нет вибрации на кнопки".
 *  Использование: <HapticButton onClick={...} className="...">…</HapticButton>
 */
export function HapticButton({ haptic = true, onClick, className, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => {
        if (haptic) hapticTap()
        onClick?.(e)
      }}
      className={cn("active:scale-95", className)}
    />
  )
}
