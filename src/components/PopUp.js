import { useEffect, useRef } from "react"

const PopUp = ({setIsPopUpShown, setShowEmojiPicker = () => {}, children, style}) => {
    const popUpRef = useRef(null)

    /*const defaultStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      width: '50%',
      zIndex: '9999',
      height: '70%',
      overflow: 'hidden',
      background: 'white',
      padding: '1em',
      borderRadius: '15px',
      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.15)',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1em',
    }*/

    useEffect(() => {
        const handleClickOutside = (e) => {
            if(popUpRef.current && !popUpRef.current.contains(e.target)) {
                setIsPopUpShown(false)
                setShowEmojiPicker(false)
            }
        }
        document.addEventListener("click", handleClickOutside)

        return () => document.removeEventListener("click", handleClickOutside)
    }, [])

    return (
      <div className="pop-up-container">
        <div className="pop-up-box" style={{...style}} ref={popUpRef}>
          { children }
          <button className="close-pop-up-button" onClick={() => setIsPopUpShown(false)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '20px'}} /*className="size-6"*/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
}

export default PopUp
