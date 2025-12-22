"use client"

import { useEffect, useState } from "react"
import { ClassicHome } from "@/components/home/ClassicHome"
import { NewHome } from "@/components/home/NewHome"
import { Button } from "@/components/ui/button"

const UI_MODE_KEY = "whot-ui-mode"

export default function Page() {
  const [uiMode, setUiMode] = useState<"classic" | "new">("new")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = window.localStorage.getItem(UI_MODE_KEY)
    if (stored === "new" || stored === "classic") {
      setUiMode(stored)
    }
  }, [])

  const toggleMode = () => {
    const next = uiMode === "classic" ? "new" : "classic"
    setUiMode(next)
    window.localStorage.setItem(UI_MODE_KEY, next)
  }

  // Prevent hydration mismatch by initially rendering nothing or a stable fallback if needed,
  // but here we default to classic so it matches server if possible, though local storage check runs in effect.
  // To avoid flicker, we just accept that the button might switch state after mount.
  
  if (!mounted) return <div className="min-h-screen bg-background" />

  return (
    <div className="relative">
      {uiMode === "classic" ? <ClassicHome /> : <NewHome />}
      
      <div className="fixed bottom-4 right-4 z-50">
        <Button 
            className="shadow-lg rounded-full opacity-50 hover:opacity-100 transition-opacity text-xs" 
            size="sm" 
            variant="secondary"
            onClick={toggleMode}
        >
            Switch to {uiMode === "classic" ? "New UI" : "Classic"}
        </Button>
      </div>
    </div>
  )
}
