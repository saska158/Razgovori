/*
Primenicu na kontekst znanje iz knjige, sredicu performans, 
pogledacu koja su sva rerenderovanja zbog promene state-a
ostavicu neke komentare mozda u zavrsnoj verziji kako bi videli kako sam razmisljala
*/

import { 
    auth, 
    database, 
    ref, 
    update, 
    onAuthStateChanged, 
    signOut,
} from "../api/firebase"
import { useState, useEffect, createContext, useContext } from "react"


const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null)

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user)
        })

        return () => unsubscribe()
    }, [])

    const logOut = async () => {
        try {
            const user = auth.currentUser
            if(user) {
                const uid = user.uid
                const userRef = ref(database, `users/${uid}`)
                await update(userRef, { isActive: false })
                await signOut(auth)
                setUser(null)
                console.log("Korisnik odjavljen.")
            }
        } catch(error) {
            console.error("Greška prilikom odjavljivanja:", error.message)
        }
    }


    return (
        <AuthContext.Provider value={{user, logOut, setUser}}>{children}</AuthContext.Provider>
    )
}

