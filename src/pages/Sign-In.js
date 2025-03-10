import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { 
    auth, 
    signInWithEmailAndPassword, 
    database, 
    ref, 
    update, 
} from "../api/firebase"
import Input from "../components/Input"
import Button from "../components/Button"

const SignIn = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const location = useLocation()
    const navigate = useNavigate()
    //console.log("Location:", location)

    const updateUserActivity = async (uid) => {
        try {
            const userRef = ref(database, `users/${uid}`)
            await update(userRef, {isActive: true})
            console.log(`Korisnik ${uid} prijavljen i aktiviran.`)
        } catch(error) {
            console.error("Greška prilikom prijavljivanja:", error.message)
        }
    }

    const handleSignIn = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try{
            const userCredential = await signInWithEmailAndPassword(auth, email, password)
            const user = userCredential.user
           //console.log('Signinovani user:', user)
            setEmail('')
            setPassword('')
            navigate(location.state?.from || '/', {replace: true})
            updateUserActivity(user.uid)
        } catch(error) {
            let customMessage
            if(error.code === 'auth/invalid-credential') {
                customMessage = `WARNING: The user name and password provided do not correspond to any account.`
            }  else if (error.code === 'auth/invalid-email') {
                customMessage = `WARNING: Enter a valid e-mail address.`
            } else if (error.code === 'auth/missing-password') {
                customMessage = `WARNING: Enter a password.`
            }  else {
                customMessage = `Error signing up: ${error.message}`;
            }
            console.error('Error signing up:', error)
            setError(customMessage)
        } finally {
            setLoading(false)
        }
    }
    
    if(loading) {
        return (
          <p>Loading...</p>
        )
    }

    if(error) {
        return (
          <p>{error}</p>
        )
    }
    
    return (
        <>
         {
            location.state?.message ?
            <p>{location.state.message}</p> :
            null
         }
         <h4>Sign in to your account</h4>
         <form>
            <Input 
              type="email"
              //id="email"
              placeholder="E-MAIL" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input 
              type='password'
              //id="password"
              placeholder="PASSWORD"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <Button 
              onClick={e => handleSignIn(e)}
              disabled={loading}
            >
              {
                loading ? "SIGNING IN..."
                : "SIGN IN"
              }
            </Button>
         </form>
        </>
    )
}

export default SignIn