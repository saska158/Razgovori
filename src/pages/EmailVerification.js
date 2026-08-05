import { auth, reload } from "../api/firebase"
import { useState, useEffect } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { useAuth } from "../contexts/authContext"
import ErrorMessage from "../components/errors/ErrorMessage"

const EmailVerification = () => {
  // Context
  const { user, setUser } = useAuth()
  
  // State
  const [isEmailVerified, setIsEmailVerified] = useState(user?.emailVerified)
  const [verificationMessage, setVerificationMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const navigate = useNavigate()

  // Functions
  const checkEmailVerified = async () => {
    setLoading(true)
    setError(null)

    try {
      await reload(auth.currentUser)
      const updatedUser = auth.currentUser
      setUser(updatedUser)
      setIsEmailVerified(updatedUser?.emailVerified)
      if(!updatedUser.emailVerified) {
        setVerificationMessage("Your email is not verified yet. Please check your email and verify your account.")
      } 
    } catch(error) {
      console.error(error)
      let customError
      if(error.code === "auth/network-request-failed") {
        customError = "Network error. Please check your connection and try again."
      } else if(error.code === "auth/user-token-expired") {
        customError = "Your session expired. Please log in again."
      } else if(error.code === "auth/user-not-found") {
        customError = "User not found. Please sign in again."
      } else {
        customError = "Failed to reload user. Please try again later."
      }
      setError(customError)
    } finally {
      setLoading(false)
    }
  }

  // Effects

  useEffect(() => {
    const finalize = async () => {
      if (isEmailVerified) {
        await reload(auth.currentUser)
        setUser(auth.currentUser)       // update context
        navigate("/", { replace: true })  // then navigate
      }
    }
    finalize()
  }, [isEmailVerified])

  return (
    <motion.div
      className="sign-in-up-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      {
        !isEmailVerified ? (
          <div className="content-container">
            <div className="email-verification-content">
              <h4>Two More Steps to Creating Your Account</h4><br />
              <p>
                1. A verification email has been sent to your email address. Please check your inbox and follow the instructions to verify your account.
              </p><br />
              <p>
                2. Once you have verified your email, click the button below to confirm your verification status.
              </p><br />
              <button 
                onClick={checkEmailVerified}
                style={{background: '#eaf4f0'}}
                disabled={loading}
              >
                {loading ? "Checking..." : "I've Verified My Email"}
              </button>
              { verificationMessage && <p>{verificationMessage}</p> }
              {error && (
                <p style={{ color: "red", marginTop: "10px" }}>
                  {error}
                </p>
              )}
            </div>
          </div>
        ) : <Navigate to="/" />
      }
      { error && <ErrorMessage message={error} /> }
    </motion.div>
  )
}

export default EmailVerification