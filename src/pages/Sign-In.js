import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { auth, signInWithEmailAndPassword } from "../api/firebase"
import { PulseLoader } from "react-spinners"
import ErrorMessage from "../components/errors/ErrorMessage"

const SignIn = () => {
  // State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Hooks that don't trigger re-renders  
  const location = useLocation()
  const navigate = useNavigate()

  const handleSignIn = async (e) => {
    e.preventDefault()
    if (!email || !password) return
        
    setLoading(true)
    setError(null)
        
    try{
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      setEmail('')
      setPassword('')
      navigate(location.state?.from || '/', {replace: true})
    } catch(error) {
      console.error("Error during sign in:", error.message)

      let errorMessage

      if (error.code === "auth/invalid-email") {
        errorMessage = "The email address is badly formatted."
      } else if (error.code === "auth/missing-password") {
        errorMessage = "Enter a password."
      } else if (error.code === "auth/user-disabled") {
        errorMessage = "Your account has been disabled."
      } else if (error.code === "auth/user-not-found") {
        errorMessage = "No user found with this email address."
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "The password is incorrect."
      } else if (error.code === "auth/invalid-credential") {
        errorMessage = "The user name and password provided do not correspond to any account."
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your connection."
      } else {
        errorMessage = "An error occurred. Please try again later."
      }

        setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }
    
  return (
    <motion.div
      className="sign-in-up-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <div className="sign-in-up-content">
        { location.state?.message ? <p>{location.state.message}</p> : null }
      <img
        src={`${process.env.PUBLIC_URL}/images/logo-green-2.png`}
        style={{width: '20%'}}
        alt="logo"
      />  
      <h4>Sign in to your account</h4>
      <form className="sign-in-up-form">
        <input 
          type="email"
          placeholder="Email" 
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input 
          type='password'
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
          {
            loading ? <PulseLoader size={10}  color="#4b896f"/> : (
              <button onClick={e => handleSignIn(e)} disabled={loading} className="green-btn">
                Sign in
              </button>
            )
          }
      </form>
      { error && <ErrorMessage message={error} /> }
      </div>
    </motion.div>
  )
}

export default SignIn