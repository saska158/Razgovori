require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { db } = require('../firebase')

const displayName = process.argv[2]
if (!displayName) {
  console.error('Usage: node scripts/unban.js <displayName>')
  process.exit(1)
}

async function unban() {
  const snapshot = await db.collection('profiles')
    .where('displayName', '==', displayName)
    .get()

  if (snapshot.empty) {
    console.log(`No user found with displayName "${displayName}"`)
    process.exit(1)
  }

  const doc = snapshot.docs[0]
  await doc.ref.update({ banned: false })
  console.log(`Unbanned ${displayName} (uid: ${doc.id})`)
}

unban().catch(err => { console.error(err); process.exit(1) })
