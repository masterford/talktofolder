"use client"

import { useEffect } from "react"
import { signOut } from "next-auth/react"

export default function SignOut() {
  useEffect(() => {
    // Clear all storage
    localStorage.clear()
    sessionStorage.clear()
    
    // Clear cookies (as much as we can from client-side)
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
    })
    
    // Sign out and redirect
    signOut({ callbackUrl: "/auth/signin" })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-2 text-gray-500">Signing out...</p>
      </div>
    </div>
  )
}