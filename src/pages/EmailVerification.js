import { auth, reload } from "../api/firebase"
import { useState, useEffect } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "../contexts/authContext"

const EmailVerification = () => {
  // Context
  const { user, setUser } = useAuth()
  
  // State
  const [isEmailVerified, setIsEmailVerified] = useState(user?.emailVerified)
  const [verificationMessage, setVerificationMessage] = useState('')
  const [error, setError] = useState(null)

  // Functions
  const checkEmailVerified = async () => {
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
      setError(error)
    } // finally i loading state
  }

  // Effects
  useEffect(() => {
    if(user) {
      setIsEmailVerified(user?.emailVerified)
    }
  }, [user]) //Cudno, razmisli...ne bi ni bili na ovoj strani da nema user-a...

  return (
    <>
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
              <button onClick={checkEmailVerified}>I've Verified My Email</button>
              { verificationMessage && <p>{verificationMessage}</p> }
            </div>
          </div>
        ) : <Navigate to="/" />//treba da vrati na sobu odakle ga je prebacilo na pravljenje naloga
      }
    </>
  )
}

export default EmailVerification