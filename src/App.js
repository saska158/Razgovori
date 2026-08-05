import './App.css'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import NavigationLayout from './layouts/NavigationLayout'
import RoomsLayout from './layouts/RoomsLayout'
import Homepage from './pages/Homepage'
import SignIn from './pages/Sign-In'
import SignUp from './pages/Sign-Up'
import EmailVerification from './pages/EmailVerification'
import MyChats from './pages/MyChats'
import UserProfile from './pages/UserProfile'
import AdminPage from './pages/AdminPage'
import AuthRequired from './components/AuthRequired'
import { AuthProvider } from './contexts/authContext'
import { ModerationProvider, useModerationTrace } from './contexts/moderationContext'
import ModerationTraceModal from './components/post/ModerationTraceModal'
import { ErrorBoundary } from 'react-error-boundary'
import ErrorFallback from './components/errors/ErrorFallback'

const GlobalModerationTrace = () => {
  const { isOpen, isLoading, events, closeTrace } = useModerationTrace()
  return (
    <AnimatePresence>
      {isOpen && (
        <ModerationTraceModal events={events} isLoading={isLoading} onClose={closeTrace} />
      )}
    </AnimatePresence>
  )
}

const AppRoutes = () => {
  const location = useLocation()
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route element={<NavigationLayout />}>
            <Route path='/' element={<RoomsLayout />}>
              <Route index element={<Homepage roomId="watching" />} />
              <Route path=':roomId' element={<Homepage />} />
            </Route>
            <Route element={<AuthRequired />}>
              <Route path='my-chats' element={<MyChats />} />
            </Route>
            <Route path='user/:profileUid' element={<UserProfile />} />
            <Route path='admin' element={<AdminPage />} />
          </Route>
          <Route path='sign-in' element={<SignIn />} />
          <Route path='sign-up' element={<SignUp />} />
          <Route path='email-verification' element={<EmailVerification />} />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  )
}

const App = () => {
  return (
    <AuthProvider>
      <ModerationProvider>
        <BrowserRouter>
          <AppRoutes />
          <GlobalModerationTrace />
        </BrowserRouter>
      </ModerationProvider>
    </AuthProvider>
  )
}

export default App
