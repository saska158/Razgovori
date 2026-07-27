require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { db } = require('../firebase')

async function listBanned() {
  const snapshot = await db.collection('profiles')
    .where('banned', '==', true)
    .get()

  if (snapshot.empty) {
    console.log('No banned users found')
    return
  }

  snapshot.docs.forEach(doc => {
    const data = doc.data()
    console.log(`uid: ${doc.id}  displayName: ${data.displayName}`)
  })
}

listBanned().catch(err => { console.error(err); process.exit(1) })
