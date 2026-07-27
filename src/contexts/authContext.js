import { auth, firestore, database, doc, getDoc, onSnapshot, updateDoc, onAuthStateChanged, signOut, ref, set, onValue, onDisconnect } from "../api/firebase"
import { useState, useEffect, createContext, useContext } from "react"

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({children}) => {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [warnedPending, setWarnedPending] = useState(false)
  const [removedPending, setRemovedPending] = useState(false)

  useEffect(() => {
    setAuthLoading(true)
    setAuthError(null)

    let profileUnsubscribe = null
    let presenceUnsubscribe = null

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (profileUnsubscribe) { profileUnsubscribe(); profileUnsubscribe = null }
        if (presenceUnsubscribe) { presenceUnsubscribe(); presenceUnsubscribe = null }

        if (!user) {
          setUser(null)
          setWarnedPending(false)
          setRemovedPending(false)
          setAuthLoading(false)
          return
        }

        const profileSnap = await getDoc(doc(firestore, 'profiles', user.uid))
        if (profileSnap.exists() && profileSnap.data().banned) {
          await signOut(auth)
          setUser(null)
          setAuthError("Your account has been banned.")
          setAuthLoading(false)
          return
        }

        setUser(user)
        setAuthLoading(false)

        const presenceRef = ref(database, `presence/${user.uid}`)
        presenceUnsubscribe = onValue(ref(database, '.info/connected'), (snap) => {
          if (snap.val() !== true) return
          onDisconnect(presenceRef).set({ online: false })
          set(presenceRef, { online: true })
        })

        profileUnsubscribe = onSnapshot(doc(firestore, 'profiles', user.uid), (snap) => {
          if (!snap.exists()) return
          const data = snap.data()
          if (data.banned) {
            signOut(auth)
            setUser(null)
            setAuthError("Your account has been banned.")
          }
          if (data.warned) setWarnedPending(true)
          if (data.removedPending) setRemovedPending(true)
        })
      },
      (error) => {
        console.error(error)  

        let errorMessage
        if (error.code === "auth/network-request-failed") {
          errorMessage = "Network error. Please check your internet connection."
        } else if (error.code === "auth/too-many-requests") {
          errorMessage = "Too many requests. Please try again later."
        } else if (error.code === "auth/user-disabled") {
          errorMessage = "Your account has been disabled. Please contact support."
        } else if (error.code === "auth/invalid-api-key") {
          errorMessage = "Invalid API key. Please contact support."
        } else {
          errorMessage = "Failed to authenticate. Please try again later."
        }

        setAuthError(errorMessage)
        setAuthLoading(false)
      }
    )

    return () => {
      unsubscribe()
      if (profileUnsubscribe) profileUnsubscribe()
      if (presenceUnsubscribe) presenceUnsubscribe()
    }
  }, [])

  const dismissWarning = async () => {
    setWarnedPending(false)
    const currentUser = auth.currentUser
    if (currentUser) {
      await updateDoc(doc(firestore, 'profiles', currentUser.uid), { warned: false })
    }
  }

  const dismissRemoval = async () => {
    setRemovedPending(false)
    const currentUser = auth.currentUser
    if (currentUser) {
      await updateDoc(doc(firestore, 'profiles', currentUser.uid), { removedPending: false })
    }
  }

  const logOut = async () => {
    setAuthLoading(true)
    setAuthError(null)

    try {
      const user = auth.currentUser
      if(user) {
        const uid = user.uid
        await set(ref(database, `presence/${uid}`), { online: false })
        await signOut(auth)
        setUser(null)
        console.log("User signed out.")
      }
    } catch(error) {
      console.error("Error during logout:", error.message)

      let errorMessage
      if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection."
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Please try again later."
      } else if (error.code === "auth/requires-recent-login") {
        errorMessage = "Session expired. Please log in again to perform this action."
      } else if (error.code === "auth/user-not-found") {
        errorMessage = "User not found. Please log in again."
      } else if (error.code === "permission-denied") {
        errorMessage = "Permission denied. You don't have access to this data."
      } else {
        errorMessage = "Failed to log out. Please try again later."
      }

      setAuthError(errorMessage)
    } finally {
      setAuthLoading(false)
    }
  }
    
  return (
    <AuthContext.Provider value={{user, logOut, setUser, authLoading, authError, warnedPending, dismissWarning, removedPending, dismissRemoval}}>
      {children}
    </AuthContext.Provider>
  )
}

