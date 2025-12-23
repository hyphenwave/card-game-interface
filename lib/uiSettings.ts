"use client"

import { useCallback, useEffect, useState } from "react"

const RULES_KEY = "whot-enforce-rules"

export const getRuleEnforcement = (): boolean => {
  if (typeof window === "undefined") return true
  const raw = window.localStorage.getItem(RULES_KEY)
  if (raw === null) return true
  return raw === "true"
}

export const setRuleEnforcement = (value: boolean) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(RULES_KEY, value ? "true" : "false")
}

export const useRuleEnforcement = () => {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    setEnabled(getRuleEnforcement())
    const onStorage = () => setEnabled(getRuleEnforcement())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const update = useCallback((value: boolean) => {
    setEnabled(value)
    setRuleEnforcement(value)
  }, [])

  return { enabled, setEnabled: update }
}
