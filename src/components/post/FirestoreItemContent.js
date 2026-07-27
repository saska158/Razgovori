import { useState, useEffect } from "react"
import fetchLinkPreview from "../../api/fetchLinkPreview"
import extractUrls from "../../utils/extractUrls"
import renderContent from "../../utils/renderContent"
import LinkPreview from "../LinkPreview"

const FirestoreItemContent = ({content}) => {
  // State  
  const [linkData, setLinkData] = useState(null)

  // Effects
  useEffect(() => {    
    const fetchData = async () => {
      try {
        const urls = extractUrls(content.text)
        if(urls && urls.length > 0) {
          const linkDetails = await fetchLinkPreview(urls[0]) 
          setLinkData(linkDetails)                        
        } else {
          setLinkData(null)
        }
      } catch(error) {
        console.error("Error fetching link preview:", error)
        setLinkData(null)
      } 
    }
    fetchData()
  }, [content.text]) 

  return (
    <div className="post-content">
      <div>
        <p style={{padding: '0'}}>
          {renderContent(content.text)}
        </p>
        {
          content.image && (
            <img src={content.image} alt="post-image" style={{borderRadius: '15px', marginTop: '8px'}} />
          )
        }
      </div>
      {
        linkData && (
          <LinkPreview 
            {...{linkData, content}} 
            style={{display: 'flex', flexDirection: 'column'}} 
            imgStyle={{width: '100%'}}
          />
        ) 
      }
    </div>
  )
}

export default FirestoreItemContent