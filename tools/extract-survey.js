#!/usr/bin/env node
const MongoClient = require('mongodb').MongoClient
const should = require('should')

MongoClient.connect('mongodb://127.6.0.233/maowtm', (err, db) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }

  let rsps = db.collection('rbsurveyresponses')
  rsps.find({surveyId : 'jose-proxy-purchasing'}).toArray((err, docs) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    const buyWhereOptions = ['China (including HK TW & MA)', 'Japan', 'Europe', 'US']
    console.log(`ip,time,ageRange,buyHowOften,residence,buyWhat,${buyWhereOptions.join(',')},buyWhereOther,tax,prevPurchase,bringStuff,travelFreq`)

    docs.forEach(doc => {
      let ip = doc.ip
      let time = new Date(doc.time).toISOString()

      try {
        let json = JSON.parse(doc.response)
        json.should.be.an.Array()
        json.length.should.equal(9)

        let q0 = json[0]
        q0.should.be.an.Array()
        q0.length.should.equal(1)
        q0[0].should.be.a.String()
        let ageRange = q0[0].match(/^q0s([0-5])$/)[1]
        ageRange.should.be.a.String()
        ageRange = ['≤15', '16-24', '25-34', '35-49', '50-64', '≥65'][parseInt(ageRange)]
        q0 = null

        let q1 = json[1]
        q1.should.be.an.Array()
        q1.length.should.equal(1)
        q1[0].should.be.a.String()
        let buyHowOften = q1[0].match(/^q1s([0-3])$/)[1]
        buyHowOften = ['Once per week', 'Once per several week', 'Once per year', 'Hardly'][parseInt(buyHowOften)]
        q1 = null

        let q2 = json[2]
        q2.should.be.a.String()
        let residence = JSON.stringify(q2)
        q2 = null

        let q3 = json[3]
        q3.should.be.a.String()
        let buyWhat = JSON.stringify(q3)
        q3 = null

        let q4 = json[4]
        q4.should.be.an.Array()
        let q4arr = q4.map(s => {
          s.should.be.a.String()
          let ds = s.match(/^q4s(\d+)$/)
          let os = s.match(/^opsy: (.+)$/)
          if (ds) {
            return parseInt(ds[1])
          } else if (os) {
            return os[1]
          } else {
            throw new Error('...')
          }
        })
        let q4warr = [...buyWhereOptions.map(x => false), '']
        q4arr.forEach(xr => {
          if (Number.isSafeInteger(xr) && 0 <= xr && xr < buyWhereOptions.length) {
            q4warr[xr] = true
          } else {
            q4warr[q4warr.length - 1] = xr
          }
        })
        let buyWhere = q4warr.join(',')
        q4 = null

        let q5 = json[5]
        q5.should.be.an.Array()
        q5.length.should.equal(1)
        q5[0].should.be.a.String()
        let tax = q5[0].match(/^q5s([0-2])$/)[1]
        tax = ['I explicitly pay taxes', 'Seller pays taxes', 'No one pays taxes'][parseInt(tax)]
        q5 = null

        let q6 = json[6]
        q6.should.be.an.Array()
        q6.length.should.equal(1)
        q6[0].should.be.a.String()
        let prevPurchase = q6[0].match(/^q6s([0-4])$/)
        if (prevPurchase) {
          prevPurchase = [
            "No, and I don't want to do this often.",
            'Not yet, but I do want to do it for profit.',
            'Yes, but not for profit.',
            'Many times, and I did earned some money from it.',
            'I do it regularly (and professionally)'
          ][parseInt(prevPurchase[1])]
        } else {
          prevPurchase = q6[0].match(/^opsy: (.+)$/)
          if (!prevPurchase) throw new Error('...')
          prevPurchase = prevPurchase[1]
        }
        prevPurchase = JSON.stringify(prevPurchase)
        q6 = null

        let q7 = json[7]
        q7.should.be.an.Array()
        q7.length.should.equal(1)
        let bringStuff = ['Yes', 'Not much'][parseInt(q7[0].match(/^q7s([0-1])$/)[1])]
        q7 = null

        let q8 = json[8]
        q8.should.be.an.Array()
        q8.length.should.equal(1)
        let travelFreq = ['hardly', 'Once or twice per year', 'One per month'][parseInt(q8[0].match(/^q8s([0-2])$/)[1])]
        q8 = null

        let csvLine = `${ip},${time},${ageRange},${buyHowOften},${residence},${buyWhat},${buyWhere},${tax},${prevPurchase},${bringStuff},${travelFreq}`
        console.log(csvLine)
      } catch (e) {
        console.error(e)
        console.error(`Error while parsing response #${doc._id}: ${e.toString()}`)
      }
    })
    process.exit(0)

  })
})
