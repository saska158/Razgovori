import { useEffect, useRef } from "react"
import { motion } from "framer-motion"

const PopUp = ({setIsPopUpShown, setShowEmojiPicker = () => {}, children, style}) => {
    const popUpRef = useRef(null)
    const popUpContainerRef = useRef(null)

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (!document.contains(e.target)) return
        if(popUpRef.current && !popUpRef.current.contains(e.target)) {
          setIsPopUpShown(false)
          setShowEmojiPicker(false)
        }
      }
      document.addEventListener("click", handleClickOutside)

      return () => document.removeEventListener("click", handleClickOutside)
    }, [])


    return (
      <motion.div
        className="pop-up-container"
        ref={popUpContainerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        <motion.div
          className="pop-up-box"
          style={{...style}}
          ref={popUpRef}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          { children }
          <button className="close-pop-up-button" onClick={() => setIsPopUpShown(false)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '20px'}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      </motion.div>
    )
}

export default PopUp
