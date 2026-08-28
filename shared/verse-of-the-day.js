/* Verse of the Day — deterministic day-of-year rotation
 * Same verse for every visitor on the same day (no backend).
 * Curated 365-verse Apostolic Pentecostal / Oneness list.
 * Homepage widget consumer + shared source of truth for shared/verse-of-day.js
 * and the daily VOTD auto-poster cron.
 */
(function () {
  'use strict';

  var VERSES = [
    { ref: "Acts 2:38", book: "Acts", ch: 2, vs: 38, text: "Then Peter said unto them, Repent, and be baptized every one of you in the name of Jesus Christ for the remission of sins, and ye shall receive the gift of the Holy Ghost." },
    { ref: "Acts 2:39", book: "Acts", ch: 2, vs: 39, text: "For the promise is unto you, and to your children, and to all that are afar off, even as many as the Lord our God shall call." },
    { ref: "Acts 2:21", book: "Acts", ch: 2, vs: 21, text: "And it shall come to pass, that whosoever shall call on the name of the Lord shall be saved." },
    { ref: "Acts 4:12", book: "Acts", ch: 4, vs: 12, text: "Neither is there salvation in any other: for there is none other name under heaven given among men, whereby we must be saved." },
    { ref: "Acts 4:10", book: "Acts", ch: 4, vs: 10, text: "Be it known unto you all, and to all the people of Israel, that by the name of Jesus Christ of Nazareth, whom ye crucified, whom God raised from the dead, even by him doth this man stand here before you whole." },
    { ref: "Acts 8:12", book: "Acts", ch: 8, vs: 12, text: "But when they believed Philip preaching the things concerning the kingdom of God, and the name of Jesus Christ, they were baptized, both men and women." },
    { ref: "Acts 8:16", book: "Acts", ch: 8, vs: 16, text: "(For as yet he was fallen upon none of them: only they were baptized in the name of the Lord Jesus .)" },
    { ref: "Acts 10:43", book: "Acts", ch: 10, vs: 43, text: "To him give all the prophets witness, that through his name whosoever believeth in him shall receive remission of sins." },
    { ref: "Acts 10:48", book: "Acts", ch: 10, vs: 48, text: "And he commanded them to be baptized in the name of the Lord. Then prayed they him to tarry certain days." },
    { ref: "Acts 19:5", book: "Acts", ch: 19, vs: 5, text: "When they heard this, they were baptized in the name of the Lord Jesus." },
    { ref: "Acts 19:6", book: "Acts", ch: 19, vs: 6, text: "And when Paul had laid his hands upon them, the Holy Ghost came on them; and they spake with tongues, and prophesied." },
    { ref: "Acts 22:16", book: "Acts", ch: 22, vs: 16, text: "And now why tarriest thou? arise, and be baptized, and wash away thy sins, calling on the name of the Lord." },
    { ref: "Romans 10:9", book: "Romans", ch: 10, vs: 9, text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved." },
    { ref: "Romans 10:13", book: "Romans", ch: 10, vs: 13, text: "For whosoever shall call upon the name of the Lord shall be saved." },
    { ref: "Romans 6:4", book: "Romans", ch: 6, vs: 4, text: "Therefore we are buried with him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life." },
    { ref: "Romans 6:3", book: "Romans", ch: 6, vs: 3, text: "Know ye not, that so many of us as were baptized into Jesus Christ were baptized into his death?" },
    { ref: "Romans 6:23", book: "Romans", ch: 6, vs: 23, text: "For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord." },
    { ref: "Mark 16:16", book: "Mark", ch: 16, vs: 16, text: "He that believeth and is baptized shall be saved; but he that believeth not shall be damned." },
    { ref: "Mark 16:17", book: "Mark", ch: 16, vs: 17, text: "And these signs shall follow them that believe; In my name shall they cast out devils; they shall speak with new tongues;" },
    { ref: "Luke 24:47", book: "Luke", ch: 24, vs: 47, text: "And that repentance and remission of sins should be preached in his name among all nations, beginning at Jerusalem." },
    { ref: "Matthew 28:19", book: "Matthew", ch: 28, vs: 19, text: "Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost:" },
    { ref: "John 3:3", book: "John", ch: 3, vs: 3, text: "Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God." },
    { ref: "John 3:5", book: "John", ch: 3, vs: 5, text: "Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God." },
    { ref: "John 3:16", book: "John", ch: 3, vs: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
    { ref: "John 3:17", book: "John", ch: 3, vs: 17, text: "For God sent not his Son into the world to condemn the world; but that the world through him might be saved." },
    { ref: "Galatians 3:27", book: "Galatians", ch: 3, vs: 27, text: "For as many of you as have been baptized into Christ have put on Christ." },
    { ref: "Colossians 2:12", book: "Colossians", ch: 2, vs: 12, text: "Buried with him in baptism, where in also ye are risen with him through the faith of the operation of God, who hath raised him from the dead." },
    { ref: "1 Peter 3:21", book: "1 Peter", ch: 3, vs: 21, text: "The like figure whereunto even baptism doth also now save us ( not the putting away of the filth of the flesh, but the answer of a good conscience toward God ,) by the resurrection of Jesus Christ:" },
    { ref: "Titus 3:5", book: "Titus", ch: 3, vs: 5, text: "Not by works of righteousness which we have done, but according to his mercy he saved us, by the washing of regeneration, and renewing of the Holy Ghost;" },
    { ref: "Ephesians 4:5", book: "Ephesians", ch: 4, vs: 5, text: "One Lord, one faith, one baptism," },
    { ref: "Deuteronomy 6:4", book: "Deuteronomy", ch: 6, vs: 4, text: "Hear, O Israel: The LORD our God is one LORD:" },
    { ref: "Isaiah 9:6", book: "Isaiah", ch: 9, vs: 6, text: "For unto us a child is born, unto us a son is given: and the government shall be upon his shoulder: and his name shall be called Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace." },
    { ref: "Isaiah 43:10", book: "Isaiah", ch: 43, vs: 10, text: "Ye are my witnesses, saith the LORD, and my servant whom I have chosen: that ye may know and believe me, and understand that I am he: before me there was no God formed, neither shall there be after me." },
    { ref: "Isaiah 43:11", book: "Isaiah", ch: 43, vs: 11, text: "I, even I, am the LORD; and beside me there is no saviour." },
    { ref: "Isaiah 44:6", book: "Isaiah", ch: 44, vs: 6, text: "Thus saith the LORD the King of Israel, and his redeemer the LORD of hosts; I am the first, and I am the last; and beside me there is no God." },
    { ref: "Isaiah 44:8", book: "Isaiah", ch: 44, vs: 8, text: "Fear ye not, neither be afraid: have not I told thee from that time, and have declared it? ye are even my witnesses. Is there a God beside me? yea, there is no God; I know not any." },
    { ref: "Isaiah 45:5", book: "Isaiah", ch: 45, vs: 5, text: "I am the LORD, and there is none else, there is no God beside me: I girded thee, though thou hast not known me:" },
    { ref: "Isaiah 45:21", book: "Isaiah", ch: 45, vs: 21, text: "Tell ye, and bring them near; yea, let them take counsel together: who hath declared this from ancient time? who hath told it from that time? have not I the LORD? and there is no God else beside me; a just God and a Saviour; there is none beside me." },
    { ref: "Isaiah 45:22", book: "Isaiah", ch: 45, vs: 22, text: "Look unto me, and be ye saved, all the ends of the earth: for I am God, and there is none else." },
    { ref: "Zechariah 14:9", book: "Zechariah", ch: 14, vs: 9, text: "And the LORD shall be king over all the earth: in that day shall there be one LORD, and his name one." },
    { ref: "Mark 12:29", book: "Mark", ch: 12, vs: 29, text: "And Jesus answered him, The first of all the commandments is, Hear, O Israel; The Lord our God is one Lord:" },
    { ref: "John 1:1", book: "John", ch: 1, vs: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
    { ref: "John 1:14", book: "John", ch: 1, vs: 14, text: "And the Word was made flesh, and dwelt among us, ( and we beheld his glory, the glory as of the only begotten of the Father ,) full of grace and truth." },
    { ref: "John 8:24", book: "John", ch: 8, vs: 24, text: "I said therefore unto you, that ye shall die in your sins: for if ye believe not that I am he, ye shall die in your sins." },
    { ref: "John 8:58", book: "John", ch: 8, vs: 58, text: "Jesus said unto them, Verily, verily, I say unto you, Before Abraham was, I am." },
    { ref: "John 10:30", book: "John", ch: 10, vs: 30, text: "I and my Father are one." },
    { ref: "John 14:6", book: "John", ch: 14, vs: 6, text: "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me." },
    { ref: "John 14:8", book: "John", ch: 14, vs: 8, text: "Philip saith unto him, Lord, shew us the Father, and it sufficeth us." },
    { ref: "John 14:9", book: "John", ch: 14, vs: 9, text: "Jesus saith unto him, Have I been so long time with you, and yet hast thou not known me, Philip? he that hath seen me hath seen the Father; and how sayest thou then, Shew us the Father?" },
    { ref: "John 14:10", book: "John", ch: 14, vs: 10, text: "Believest thou not that I am in the Father, and the Father in me? the words that I speak unto you I speak not of myself: but the Father that dwelleth in me, he doeth the works." },
    { ref: "John 14:11", book: "John", ch: 14, vs: 11, text: "Believe me that I am in the Father, and the Father in me: or else believe me for the very works’ sake." },
    { ref: "John 14:18", book: "John", ch: 14, vs: 18, text: "I will not leave you comfortless: I will come to you." },
    { ref: "John 17:3", book: "John", ch: 17, vs: 3, text: "And this is life eternal, that they might know thee the only true God, and Jesus Christ, whom thou hast sent." },
    { ref: "John 20:28", book: "John", ch: 20, vs: 28, text: "And Thomas answered and said unto him, My Lord and my God." },
    { ref: "1 Timothy 3:16", book: "1 Timothy", ch: 3, vs: 16, text: "And without controversy great is the mystery of godliness: God was manifest in the flesh, justified in the Spirit, seen of angels, preached unto the Gentiles, believed on in the world, received up into glory." },
    { ref: "Colossians 1:15", book: "Colossians", ch: 1, vs: 15, text: "Who is the image of the invisible God, the firstborn of every creature:" },
    { ref: "Colossians 2:9", book: "Colossians", ch: 2, vs: 9, text: "For in him dwelleth all the fulness of the Godhead bodily." },
    { ref: "Colossians 1:16", book: "Colossians", ch: 1, vs: 16, text: "For by him were all things created, that are in heaven, and that are in earth, visible and invisible, whether they be thrones, or dominions, or principalities, or powers: all things were created by him, and for him:" },
    { ref: "Colossians 1:17", book: "Colossians", ch: 1, vs: 17, text: "And he is before all things, and by him all things consist." },
    { ref: "Revelation 1:8", book: "Revelation", ch: 1, vs: 8, text: "I am Alpha and Omega, the beginning and the ending, saith the Lord, which is, and which was, and which is to come, the Almighty." },
    { ref: "Joel 2:28", book: "Joel", ch: 2, vs: 28, text: "And it shall come to pass afterward, that I will pour out my spirit upon all flesh; and your sons and your daughters shall prophesy, your old men shall dream dreams, your young men shall see visions:" },
    { ref: "Joel 2:29", book: "Joel", ch: 2, vs: 29, text: "And also upon the servants and upon the handmaids in those days will I pour out my spirit." },
    { ref: "Acts 1:8", book: "Acts", ch: 1, vs: 8, text: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judæa, and in Samaria, and unto the uttermost part of the earth." },
    { ref: "Acts 1:5", book: "Acts", ch: 1, vs: 5, text: "For John truly baptized with water; but ye shall be baptized with the Holy Ghost not many days hence." },
    { ref: "Acts 2:4", book: "Acts", ch: 2, vs: 4, text: "And they were all filled with the Holy Ghost, and began to speak with other tongues, as the Spirit gave them utterance." },
    { ref: "Acts 10:44", book: "Acts", ch: 10, vs: 44, text: "While Peter yet spake these words, the Holy Ghost fell on all them which heard the word." },
    { ref: "Acts 10:46", book: "Acts", ch: 10, vs: 46, text: "For they heard them speak with tongues, and magnify God. Then answered Peter," },
    { ref: "John 14:16", book: "John", ch: 14, vs: 16, text: "And I will pray the Father, and he shall give you another Comforter, that he may abide with you for ever;" },
    { ref: "John 14:17", book: "John", ch: 14, vs: 17, text: "Even the Spirit of truth; whom the world cannot receive, because it seeth him not, neither knoweth him: but ye know him; for he dwelleth with you, and shall be in you." },
    { ref: "John 14:26", book: "John", ch: 14, vs: 26, text: "But the Comforter, which is the Holy Ghost, whom the Father will send in my name, he shall teach you all things, and bring all things to your remembrance, whatsoever I have said unto you." },
    { ref: "John 16:13", book: "John", ch: 16, vs: 13, text: "Howbeit when he, the Spirit of truth, is come, he will guide you into all truth: for he shall not speak of himself; but whatsoever he shall hear, that shall he speak: and he will shew you things to come." },
    { ref: "John 7:38", book: "John", ch: 7, vs: 38, text: "He that believeth on me, as the scripture hath said, out of his belly shall flow rivers of living water." },
    { ref: "John 7:39", book: "John", ch: 7, vs: 39, text: "(But this spake he of the Spirit, which they that believe on him should receive: for the Holy Ghost was not yet given; because that Jesus was not yet glorified .)" },
    { ref: "Romans 8:9", book: "Romans", ch: 8, vs: 9, text: "But ye are not in the flesh, but in the Spirit, if so be that the Spirit of God dwell in you. Now if any man have not the Spirit of Christ, he is none of his." },
    { ref: "Romans 8:11", book: "Romans", ch: 8, vs: 11, text: "But if the Spirit of him that raised up Jesus from the dead dwell in you, he that raised up Christ from the dead shall also quicken your mortal bodies by his Spirit that dwelleth in you." },
    { ref: "Romans 8:14", book: "Romans", ch: 8, vs: 14, text: "For as many as are led by the Spirit of God, they are the sons of God." },
    { ref: "Romans 8:16", book: "Romans", ch: 8, vs: 16, text: "The Spirit itself beareth witness with our spirit, that we are the children of God:" },
    { ref: "Romans 8:26", book: "Romans", ch: 8, vs: 26, text: "Likewise the Spirit also helpeth our infirmities: for we know not what we should pray for as we ought: but the Spirit itself maketh intercession for us with groanings which cannot be uttered." },
    { ref: "1 Corinthians 12:13", book: "1 Corinthians", ch: 12, vs: 13, text: "For by one Spirit are we all baptized into one body, whether we be Jews or Gentiles, whether we be bond or free; and have been all made to drink into one Spirit." },
    { ref: "1 Corinthians 3:16", book: "1 Corinthians", ch: 3, vs: 16, text: "Know ye not that ye are the temple of God, and that the Spirit of God dwelleth in you?" },
    { ref: "1 Corinthians 6:19", book: "1 Corinthians", ch: 6, vs: 19, text: "What? know ye not that your body is the temple of the Holy Ghost which is in you, which ye have of God, and ye are not your own?" },
    { ref: "2 Corinthians 3:17", book: "2 Corinthians", ch: 3, vs: 17, text: "Now the Lord is that Spirit: and where the Spirit of the Lord is, there is liberty." },
    { ref: "Galatians 5:22", book: "Galatians", ch: 5, vs: 22, text: "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith," },
    { ref: "Galatians 5:25", book: "Galatians", ch: 5, vs: 25, text: "If we live in the Spirit, let us also walk in the Spirit." },
    { ref: "Ephesians 1:13", book: "Ephesians", ch: 1, vs: 13, text: "In whom ye also trusted, after that ye heard the word of truth, the gospel of your salvation: in whom also after that ye believed, ye were sealed with that holy Spirit of promise," },
    { ref: "Matthew 5:3", book: "Matthew", ch: 5, vs: 3, text: "Blessed are the poor in spirit: for theirs is the kingdom of heaven." },
    { ref: "Matthew 5:8", book: "Matthew", ch: 5, vs: 8, text: "Blessed are the pure in heart: for they shall see God." },
    { ref: "Matthew 5:14", book: "Matthew", ch: 5, vs: 14, text: "Ye are the light of the world. A city that is set on an hill cannot be hid." },
    { ref: "Matthew 5:16", book: "Matthew", ch: 5, vs: 16, text: "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven." },
    { ref: "Matthew 5:44", book: "Matthew", ch: 5, vs: 44, text: "But I say unto you, Love your enemies, bless them that curse you, do good to them that hate you, and pray for them which despitefully use you, and persecute you;" },
    { ref: "Matthew 5:48", book: "Matthew", ch: 5, vs: 48, text: "Be ye therefore perfect, even as your Father which is in heaven is perfect." },
    { ref: "Matthew 6:6", book: "Matthew", ch: 6, vs: 6, text: "But thou, when thou prayest, enter into thy closet, and when thou hast shut thy door, pray to thy Father which is in secret; and thy Father which seeth in secret shall reward thee openly." },
    { ref: "Matthew 6:9", book: "Matthew", ch: 6, vs: 9, text: "After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name." },
    { ref: "Matthew 6:20", book: "Matthew", ch: 6, vs: 20, text: "But lay up for yourselves treasures in heaven, where neither moth nor rust doth corrupt, and where thieves do not break through nor steal:" },
    { ref: "Matthew 6:33", book: "Matthew", ch: 6, vs: 33, text: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you." },
    { ref: "Matthew 7:7", book: "Matthew", ch: 7, vs: 7, text: "Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you:" },
    { ref: "Matthew 7:12", book: "Matthew", ch: 7, vs: 12, text: "Therefore all things whatsoever ye would that men should do to you, do ye even so to them: for this is the law and the prophets." },
    { ref: "Matthew 7:21", book: "Matthew", ch: 7, vs: 21, text: "Not every one that saith unto me, Lord, Lord, shall enter into the kingdom of heaven; but he that doeth the will of my Father which is in heaven." },
    { ref: "Matthew 11:28", book: "Matthew", ch: 11, vs: 28, text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
    { ref: "Matthew 11:29", book: "Matthew", ch: 11, vs: 29, text: "Take my yoke upon you, and learn of me; for I am meek and lowly in heart: and ye shall find rest unto your souls." },
    { ref: "Matthew 22:37", book: "Matthew", ch: 22, vs: 37, text: "Jesus said unto him, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind." },
    { ref: "Matthew 22:39", book: "Matthew", ch: 22, vs: 39, text: "And the second is like unto it, Thou shalt love thy neighbour as thyself." },
    { ref: "Mark 10:27", book: "Mark", ch: 10, vs: 27, text: "And Jesus looking upon them saith, With men it is impossible, but not with God: for with God all things are possible." },
    { ref: "Mark 11:24", book: "Mark", ch: 11, vs: 24, text: "Therefore I say unto you, What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them." },
    { ref: "Mark 12:30", book: "Mark", ch: 12, vs: 30, text: "And thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind, and with all thy strength: this is the first commandment." },
    { ref: "Luke 6:27", book: "Luke", ch: 6, vs: 27, text: "But I say unto you which hear, Love your enemies, do good to them which hate you," },
    { ref: "Luke 6:38", book: "Luke", ch: 6, vs: 38, text: "Give, and it shall be given unto you; good measure, pressed down, and shaken together, and running over, shall men give into your bosom. For with the same measure that ye mete withal it shall be measured to you again." },
    { ref: "Luke 9:23", book: "Luke", ch: 9, vs: 23, text: "And he said to them all, If any man will come after me, let him deny himself, and take up his cross daily, and follow me." },
    { ref: "Luke 15:7", book: "Luke", ch: 15, vs: 7, text: "I say unto you, that likewise joy shall be in heaven over one sinner that repenteth, more than over ninety and nine just persons, which need no repentance." },
    { ref: "Luke 19:10", book: "Luke", ch: 19, vs: 10, text: "For the Son of man is come to seek and to save that which was lost." },
    { ref: "Psalms 51:10", book: "Psalms", ch: 51, vs: 10, text: "Create in me a clean heart, O God; and renew a right spirit within me." },
    { ref: "Psalms 51:17", book: "Psalms", ch: 51, vs: 17, text: "The sacrifices of God are a broken spirit: a broken and a contrite heart, O God, thou wilt not despise." },
    { ref: "Psalms 66:18", book: "Psalms", ch: 66, vs: 18, text: "If I regard iniquity in my heart, the Lord will not hear me:" },
    { ref: "Psalms 139:23", book: "Psalms", ch: 139, vs: 23, text: "Search me, O God, and know my heart: try me, and know my thoughts:" },
    { ref: "Psalms 139:24", book: "Psalms", ch: 139, vs: 24, text: "And see if there be any wicked way in me, and lead me in the way everlasting." },
    { ref: "Isaiah 55:6", book: "Isaiah", ch: 55, vs: 6, text: "Seek ye the LORD while he may be found, call ye upon him while he is near:" },
    { ref: "Isaiah 55:7", book: "Isaiah", ch: 55, vs: 7, text: "Let the wicked forsake his way, and the unrighteous man his thoughts: and let him return unto the LORD, and he will have mercy upon him; and to our God, for he will abundantly pardon." },
    { ref: "Isaiah 58:6", book: "Isaiah", ch: 58, vs: 6, text: "Is not this the fast that I have chosen? to loose the bands of wickedness, to undo the heavy burdens, and to let the oppressed go free, and that ye break every yoke?" },
    { ref: "Jeremiah 33:3", book: "Jeremiah", ch: 33, vs: 3, text: "Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not." },
    { ref: "Matthew 6:17", book: "Matthew", ch: 6, vs: 17, text: "But thou, when thou fastest, anoint thine head, and wash thy face;" },
    { ref: "Matthew 17:20", book: "Matthew", ch: 17, vs: 20, text: "And Jesus said unto them, Because of your unbelief: for verily I say unto you, If ye have faith as a grain of mustard seed, ye shall say unto this mountain, Remove hence to yonder place; and it shall remove; and nothing shall be impossible unto you." },
    { ref: "Luke 11:9", book: "Luke", ch: 11, vs: 9, text: "And I say unto you, Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you." },
    { ref: "Luke 18:1", book: "Luke", ch: 18, vs: 1, text: "And he spake a parable unto them to this end, that men ought always to pray, and not to faint;" },
    { ref: "1 Thessalonians 5:17", book: "1 Thessalonians", ch: 5, vs: 17, text: "Pray without ceasing." },
    { ref: "James 4:7", book: "James", ch: 4, vs: 7, text: "Submit yourselves therefore to God. Resist the devil, and he will flee from you." },
    { ref: "James 4:8", book: "James", ch: 4, vs: 8, text: "Draw nigh to God, and he will draw nigh to you. Cleanse your hands, ye sinners; and purify your hearts, ye double minded." },
    { ref: "James 5:16", book: "James", ch: 5, vs: 16, text: "Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much." },
    { ref: "1 John 5:14", book: "1 John", ch: 5, vs: 14, text: "And this is the confidence that we have in him, that, if we ask any thing according to his will, he heareth us:" },
    { ref: "1 John 5:15", book: "1 John", ch: 5, vs: 15, text: "And if we know that he hear us, whatsoever we ask, we know that we have the petitions that we desired of him." },
    { ref: "Philippians 4:6", book: "Philippians", ch: 4, vs: 6, text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God." },
    { ref: "Hebrews 11:1", book: "Hebrews", ch: 11, vs: 1, text: "Now faith is the substance of things hoped for, the evidence of things not seen." },
    { ref: "Hebrews 11:6", book: "Hebrews", ch: 11, vs: 6, text: "But without faith it is impossible to please him: for he that cometh to God must believe that he is, and that he is a rewarder of them that diligently seek him." },
    { ref: "Hebrews 10:23", book: "Hebrews", ch: 10, vs: 23, text: "Let us hold fast the profession of our faith without wavering; ( for he is faithful that promised ;)" },
    { ref: "Hebrews 10:25", book: "Hebrews", ch: 10, vs: 25, text: "Not forsaking the assembling of ourselves together, as the manner of some is; but exhorting one another: and so much the more, as ye see the day approaching." },
    { ref: "Hebrews 12:1", book: "Hebrews", ch: 12, vs: 1, text: "Wherefore seeing we also are compassed about with so great a cloud of witnesses, let us lay aside every weight, and the sin which doth so easily beset us, and let us run with patience the race that is set before us," },
    { ref: "Hebrews 12:2", book: "Hebrews", ch: 12, vs: 2, text: "Looking unto Jesus the author and finisher of our faith; who for the joy that was set before him endured the cross, despising the shame, and is set down at the right hand of the throne of God." },
    { ref: "Hebrews 13:5", book: "Hebrews", ch: 13, vs: 5, text: "Let your conversation be without covetousness; and be content with such things as ye have: for he hath said, I will never leave thee, nor forsake thee." },
    { ref: "Hebrews 13:8", book: "Hebrews", ch: 13, vs: 8, text: "Jesus Christ the same yesterday, and to day, and for ever." },
    { ref: "Romans 12:1", book: "Romans", ch: 12, vs: 1, text: "I beseech you therefore, brethren, by the mercies of God, that ye present your bodies a living sacrifice, holy, acceptable unto God, which is your reasonable service." },
    { ref: "Romans 12:2", book: "Romans", ch: 12, vs: 2, text: "And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God." },
    { ref: "Romans 8:28", book: "Romans", ch: 8, vs: 28, text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose." },
    { ref: "Romans 8:31", book: "Romans", ch: 8, vs: 31, text: "What shall we then say to these things? If God be for us, who can be against us?" },
    { ref: "Romans 8:37", book: "Romans", ch: 8, vs: 37, text: "Nay, in all these things we are more than conquerors through him that loved us." },
    { ref: "Romans 8:38", book: "Romans", ch: 8, vs: 38, text: "For I am persuaded, that neither death, nor life, nor angels, nor principalities, nor powers, nor things present, nor things to come," },
    { ref: "Romans 8:39", book: "Romans", ch: 8, vs: 39, text: "Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God, which is in Christ Jesus our Lord." },
    { ref: "Ephesians 6:10", book: "Ephesians", ch: 6, vs: 10, text: "Finally, my brethren, be strong in the Lord, and in the power of his might." },
    { ref: "Ephesians 6:11", book: "Ephesians", ch: 6, vs: 11, text: "Put on the whole armour of God, that ye may be able to stand against the wiles of the devil." },
    { ref: "2 Corinthians 5:7", book: "2 Corinthians", ch: 5, vs: 7, text: "(For we walk by faith, not by sight :)" },
    { ref: "2 Corinthians 5:17", book: "2 Corinthians", ch: 5, vs: 17, text: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new." },
    { ref: "2 Corinthians 10:4", book: "2 Corinthians", ch: 10, vs: 4, text: "(For the weapons of our warfare are not carnal, but mighty through God to the pulling down of strong holds ;)" },
    { ref: "2 Corinthians 10:5", book: "2 Corinthians", ch: 10, vs: 5, text: "Casting down imaginations, and every high thing that exalteth itself against the knowledge of God, and bringing into captivity every thought to the obedience of Christ;" },
    { ref: "Galatians 2:20", book: "Galatians", ch: 2, vs: 20, text: "I am crucified with Christ: nevertheless I live; yet not I, but Christ liveth in me: and the life which I now live in the flesh I live by the faith of the Son of God, who loved me, and gave himself for me." },
    { ref: "Galatians 5:1", book: "Galatians", ch: 5, vs: 1, text: "Stand fast therefore in the liberty wherewith Christ hath made us free, and be not entangled again with the yoke of bondage." },
    { ref: "Galatians 6:9", book: "Galatians", ch: 6, vs: 9, text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not." },
    { ref: "Philippians 3:14", book: "Philippians", ch: 3, vs: 14, text: "I press toward the mark for the prize of the high calling of God in Christ Jesus." },
    { ref: "Psalms 1:1", book: "Psalms", ch: 1, vs: 1, text: "Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful." },
    { ref: "Psalms 1:2", book: "Psalms", ch: 1, vs: 2, text: "But his delight is in the law of the LORD; and in his law doth he meditate day and night." },
    { ref: "Psalms 8:4", book: "Psalms", ch: 8, vs: 4, text: "What is man, that thou art mindful of him? and the son of man, that thou visitest him?" },
    { ref: "Psalms 16:11", book: "Psalms", ch: 16, vs: 11, text: "Thou wilt shew me the path of life: in thy presence is fulness of joy; at thy right hand there are pleasures for evermore." },
    { ref: "Psalms 19:1", book: "Psalms", ch: 19, vs: 1, text: "The heavens declare the glory of God; and the firmament sheweth his handywork." },
    { ref: "Psalms 19:14", book: "Psalms", ch: 19, vs: 14, text: "Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight, O LORD, my strength, and my redeemer." },
    { ref: "Psalms 23:1", book: "Psalms", ch: 23, vs: 1, text: "The LORD is my shepherd; I shall not want." },
    { ref: "Psalms 23:4", book: "Psalms", ch: 23, vs: 4, text: "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me." },
    { ref: "Psalms 23:6", book: "Psalms", ch: 23, vs: 6, text: "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever." },
    { ref: "Psalms 27:1", book: "Psalms", ch: 27, vs: 1, text: "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?" },
    { ref: "Psalms 27:14", book: "Psalms", ch: 27, vs: 14, text: "Wait on the LORD: be of good courage, and he shall strengthen thine heart: wait, I say, on the LORD." },
    { ref: "Psalms 34:8", book: "Psalms", ch: 34, vs: 8, text: "O taste and see that the LORD is good: blessed is the man that trusteth in him." },
    { ref: "Psalms 34:18", book: "Psalms", ch: 34, vs: 18, text: "The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit." },
    { ref: "Psalms 37:4", book: "Psalms", ch: 37, vs: 4, text: "Delight thyself also in the LORD; and he shall give thee the desires of thine heart." },
    { ref: "Psalms 37:5", book: "Psalms", ch: 37, vs: 5, text: "Commit thy way unto the LORD; trust also in him; and he shall bring it to pass." },
    { ref: "Psalms 42:1", book: "Psalms", ch: 42, vs: 1, text: "As the hart panteth after the water brooks, so panteth my soul after thee, O God." },
    { ref: "Psalms 46:1", book: "Psalms", ch: 46, vs: 1, text: "God is our refuge and strength, a very present help in trouble." },
    { ref: "Psalms 46:10", book: "Psalms", ch: 46, vs: 10, text: "Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth." },
    { ref: "Psalms 56:3", book: "Psalms", ch: 56, vs: 3, text: "What time I am afraid, I will trust in thee." },
    { ref: "Psalms 91:1", book: "Psalms", ch: 91, vs: 1, text: "He that dwelleth in the secret place of the most High shall abide under the shadow of the Almighty." },
    { ref: "Psalms 91:2", book: "Psalms", ch: 91, vs: 2, text: "I will say of the LORD, He is my refuge and my fortress: my God; in him will I trust." },
    { ref: "Psalms 91:11", book: "Psalms", ch: 91, vs: 11, text: "For he shall give his angels charge over thee, to keep thee in all thy ways." },
    { ref: "Psalms 100:4", book: "Psalms", ch: 100, vs: 4, text: "Enter into his gates with thanksgiving, and into his courts with praise: be thankful unto him, and bless his name." },
    { ref: "Psalms 100:5", book: "Psalms", ch: 100, vs: 5, text: "For the LORD is good; his mercy is everlasting; and his truth endureth to all generations." },
    { ref: "Psalms 103:1", book: "Psalms", ch: 103, vs: 1, text: "Bless the LORD, O my soul: and all that is within me, bless his holy name." },
    { ref: "Psalms 103:12", book: "Psalms", ch: 103, vs: 12, text: "As far as the east is from the west, so far hath he removed our transgressions from us." },
    { ref: "Psalms 118:24", book: "Psalms", ch: 118, vs: 24, text: "This is the day which the LORD hath made; we will rejoice and be glad in it." },
    { ref: "Psalms 119:11", book: "Psalms", ch: 119, vs: 11, text: "Thy word have I hid in mine heart, that I might not sin against thee." },
    { ref: "Psalms 119:105", book: "Psalms", ch: 119, vs: 105, text: "Thy word is a lamp unto my feet, and a light unto my path." },
    { ref: "Psalms 121:1", book: "Psalms", ch: 121, vs: 1, text: "I will lift up mine eyes unto the hills, from whence cometh my help." },
    { ref: "Proverbs 1:7", book: "Proverbs", ch: 1, vs: 7, text: "The fear of the LORD is the beginning of knowledge: but fools despise wisdom and instruction." },
    { ref: "Proverbs 3:5", book: "Proverbs", ch: 3, vs: 5, text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding." },
    { ref: "Proverbs 3:6", book: "Proverbs", ch: 3, vs: 6, text: "In all thy ways acknowledge him, and he shall direct thy paths." },
    { ref: "Proverbs 3:9", book: "Proverbs", ch: 3, vs: 9, text: "Honour the LORD with thy substance, and with the firstfruits of all thine increase:" },
    { ref: "Proverbs 4:23", book: "Proverbs", ch: 4, vs: 23, text: "Keep thy heart with all diligence; for out of it are the issues of life." },
    { ref: "Proverbs 9:10", book: "Proverbs", ch: 9, vs: 10, text: "The fear of the LORD is the beginning of wisdom: and the knowledge of the holy is understanding." },
    { ref: "Proverbs 11:30", book: "Proverbs", ch: 11, vs: 30, text: "The fruit of the righteous is a tree of life; and he that winneth souls is wise." },
    { ref: "Proverbs 14:12", book: "Proverbs", ch: 14, vs: 12, text: "There is a way which seemeth right unto a man, but the end thereof are the ways of death." },
    { ref: "Proverbs 15:1", book: "Proverbs", ch: 15, vs: 1, text: "A soft answer turneth away wrath: but grievous words stir up anger." },
    { ref: "Proverbs 15:3", book: "Proverbs", ch: 15, vs: 3, text: "The eyes of the LORD are in every place, beholding the evil and the good." },
    { ref: "Proverbs 16:3", book: "Proverbs", ch: 16, vs: 3, text: "Commit thy works unto the LORD, and thy thoughts shall be established." },
    { ref: "Proverbs 16:9", book: "Proverbs", ch: 16, vs: 9, text: "A man’s heart deviseth his way: but the LORD directeth his steps." },
    { ref: "Proverbs 16:32", book: "Proverbs", ch: 16, vs: 32, text: "He that is slow to anger is better than the mighty; and he that ruleth his spirit than he that taketh a city." },
    { ref: "Proverbs 17:17", book: "Proverbs", ch: 17, vs: 17, text: "A friend loveth at all times, and a brother is born for adversity." },
    { ref: "Proverbs 18:10", book: "Proverbs", ch: 18, vs: 10, text: "The name of the LORD is a strong tower: the righteous runneth into it, and is safe." },
    { ref: "Proverbs 18:21", book: "Proverbs", ch: 18, vs: 21, text: "Death and life are in the power of the tongue: and they that love it shall eat the fruit thereof." },
    { ref: "Proverbs 22:6", book: "Proverbs", ch: 22, vs: 6, text: "Train up a child in the way he should go: and when he is old, he will not depart from it." },
    { ref: "Proverbs 27:17", book: "Proverbs", ch: 27, vs: 17, text: "Iron sharpeneth iron; so a man sharpeneth the countenance of his friend." },
    { ref: "Proverbs 28:13", book: "Proverbs", ch: 28, vs: 13, text: "He that covereth his sins shall not prosper: but whoso confesseth and forsaketh them shall have mercy." },
    { ref: "Proverbs 29:25", book: "Proverbs", ch: 29, vs: 25, text: "The fear of man bringeth a snare: but whoso putteth his trust in the LORD shall be safe." },
    { ref: "Isaiah 1:18", book: "Isaiah", ch: 1, vs: 18, text: "Come now, and let us reason together, saith the LORD: though your sins be as scarlet, they shall be as white as snow; though they be red like crimson, they shall be as wool." },
    { ref: "Isaiah 6:8", book: "Isaiah", ch: 6, vs: 8, text: "Also I heard the voice of the Lord, saying, Whom shall I send, and who will go for us? Then said I, Here am I; send me." },
    { ref: "Isaiah 26:3", book: "Isaiah", ch: 26, vs: 3, text: "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee." },
    { ref: "Isaiah 40:8", book: "Isaiah", ch: 40, vs: 8, text: "The grass withereth, the flower fadeth: but the word of our God shall stand for ever." },
    { ref: "Isaiah 40:29", book: "Isaiah", ch: 40, vs: 29, text: "He giveth power to the faint; and to them that have no might he increaseth strength." },
    { ref: "Isaiah 40:31", book: "Isaiah", ch: 40, vs: 31, text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint." },
    { ref: "Isaiah 41:10", book: "Isaiah", ch: 41, vs: 10, text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness." },
    { ref: "Isaiah 41:13", book: "Isaiah", ch: 41, vs: 13, text: "For I the LORD thy God will hold thy right hand, saying unto thee, Fear not; I will help thee." },
    { ref: "Isaiah 43:2", book: "Isaiah", ch: 43, vs: 2, text: "When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee." },
    { ref: "Isaiah 53:3", book: "Isaiah", ch: 53, vs: 3, text: "He is despised and rejected of men; a man of sorrows, and acquainted with grief: and we hid as it were our faces from him; he was despised, and we esteemed him not." },
    { ref: "Isaiah 53:5", book: "Isaiah", ch: 53, vs: 5, text: "But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed." },
    { ref: "Isaiah 53:6", book: "Isaiah", ch: 53, vs: 6, text: "All we like sheep have gone astray; we have turned every one to his own way; and the LORD hath laid on him the iniquity of us all." },
    { ref: "Isaiah 55:8", book: "Isaiah", ch: 55, vs: 8, text: "For my thoughts are not your thoughts, neither are your ways my ways, saith the LORD." },
    { ref: "Isaiah 55:11", book: "Isaiah", ch: 55, vs: 11, text: "So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please, and it shall prosper in the thing whereto I sent it." },
    { ref: "Isaiah 61:1", book: "Isaiah", ch: 61, vs: 1, text: "The Spirit of the Lord GOD is upon me; because the LORD hath anointed me to preach good tidings unto the meek; he hath sent me to bind up the brokenhearted, to proclaim liberty to the captives, and the opening of the prison to them that are bound;" },
    { ref: "Isaiah 66:2", book: "Isaiah", ch: 66, vs: 2, text: "For all those things hath mine hand made, and all those things have been, saith the LORD: but to this man will I look, even to him that is poor and of a contrite spirit, and trembleth at my word." },
    { ref: "Jeremiah 17:7", book: "Jeremiah", ch: 17, vs: 7, text: "Blessed is the man that trusteth in the LORD, and whose hope the LORD is." },
    { ref: "Jeremiah 29:11", book: "Jeremiah", ch: 29, vs: 11, text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end." },
    { ref: "Jeremiah 29:13", book: "Jeremiah", ch: 29, vs: 13, text: "And ye shall seek me, and find me, when ye shall search for me with all your heart." },
    { ref: "Jeremiah 31:3", book: "Jeremiah", ch: 31, vs: 3, text: "The LORD hath appeared of old unto me, saying, Yea, I have loved thee with an everlasting love: therefore with lovingkindness have I drawn thee." },
    { ref: "Lamentations 3:22", book: "Lamentations", ch: 3, vs: 22, text: "It is of the LORD’s mercies that we are not consumed, because his compassions fail not." },
    { ref: "Lamentations 3:23", book: "Lamentations", ch: 3, vs: 23, text: "They are new every morning: great is thy faithfulness." },
    { ref: "Ezekiel 36:26", book: "Ezekiel", ch: 36, vs: 26, text: "A new heart also will I give you, and a new spirit will I put within you: and I will take away the stony heart out of your flesh, and I will give you an heart of flesh." },
    { ref: "Ezekiel 36:27", book: "Ezekiel", ch: 36, vs: 27, text: "And I will put my spirit within you, and cause you to walk in my statutes, and ye shall keep my judgments, and do them." },
    { ref: "Micah 6:8", book: "Micah", ch: 6, vs: 8, text: "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?" },
    { ref: "Matthew 1:21", book: "Matthew", ch: 1, vs: 21, text: "And she shall bring forth a son, and thou shalt call his name JESUS: for he shall save his people from their sins." },
    { ref: "Matthew 1:23", book: "Matthew", ch: 1, vs: 23, text: "Behold, a virgin shall be with child, and shall bring forth a son, and they shall call his name Emmanuel, which being interpreted is, God with us." },
    { ref: "Matthew 3:11", book: "Matthew", ch: 3, vs: 11, text: "I indeed baptize you with water unto repentance: but he that cometh after me is mightier than I, whose shoes I am not worthy to bear: he shall baptize you with the Holy Ghost, and with fire:" },
    { ref: "Matthew 4:4", book: "Matthew", ch: 4, vs: 4, text: "But he answered and said, It is written, Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God." },
    { ref: "Matthew 16:18", book: "Matthew", ch: 16, vs: 18, text: "And I say also unto thee, That thou art Peter, and upon this rock I will build my church; and the gates of hell shall not prevail against it." },
    { ref: "Matthew 16:24", book: "Matthew", ch: 16, vs: 24, text: "Then said Jesus unto his disciples, If any man will come after me, let him deny himself, and take up his cross, and follow me." },
    { ref: "Matthew 18:20", book: "Matthew", ch: 18, vs: 20, text: "For where two or three are gathered together in my name, there am I in the midst of them." },
    { ref: "Matthew 24:14", book: "Matthew", ch: 24, vs: 14, text: "And this gospel of the kingdom shall be preached in all the world for a witness unto all nations; and then shall the end come." },
    { ref: "Matthew 24:35", book: "Matthew", ch: 24, vs: 35, text: "Heaven and earth shall pass away, but my words shall not pass away." },
    { ref: "Matthew 24:42", book: "Matthew", ch: 24, vs: 42, text: "Watch therefore: for ye know not what hour your Lord doth come." },
    { ref: "Matthew 28:6", book: "Matthew", ch: 28, vs: 6, text: "He is not here: for he is risen, as he said. Come, see the place where the Lord lay." },
    { ref: "Matthew 28:18", book: "Matthew", ch: 28, vs: 18, text: "And Jesus came and spake unto them, saying, All power is given unto me in heaven and in earth." },
    { ref: "Matthew 28:20", book: "Matthew", ch: 28, vs: 20, text: "Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen." },
    { ref: "Luke 1:37", book: "Luke", ch: 1, vs: 37, text: "For with God nothing shall be impossible." },
    { ref: "Luke 2:11", book: "Luke", ch: 2, vs: 11, text: "For unto you is born this day in the city of David a Saviour, which is Christ the Lord." },
    { ref: "John 10:10", book: "John", ch: 10, vs: 10, text: "The thief cometh not, but for to steal, and to kill, and to destroy: I am come that they might have life, and that they might have it more abundantly." },
    { ref: "John 10:11", book: "John", ch: 10, vs: 11, text: "I am the good shepherd: the good shepherd giveth his life for the sheep." },
    { ref: "John 11:25", book: "John", ch: 11, vs: 25, text: "Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live:" },
    { ref: "John 15:5", book: "John", ch: 15, vs: 5, text: "I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing." },
    { ref: "John 15:13", book: "John", ch: 15, vs: 13, text: "Greater love hath no man than this, that a man lay down his life for his friends." },
    { ref: "Romans 1:16", book: "Romans", ch: 1, vs: 16, text: "For I am not ashamed of the gospel of Christ: for it is the power of God unto salvation to every one that believeth; to the Jew first, and also to the Greek." },
    { ref: "Romans 3:23", book: "Romans", ch: 3, vs: 23, text: "For all have sinned, and come short of the glory of God;" },
    { ref: "Romans 5:8", book: "Romans", ch: 5, vs: 8, text: "But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us." },
    { ref: "Romans 12:12", book: "Romans", ch: 12, vs: 12, text: "Rejoicing in hope; patient in tribulation; continuing instant in prayer;" },
    { ref: "Romans 12:21", book: "Romans", ch: 12, vs: 21, text: "Be not overcome of evil, but overcome evil with good." },
    { ref: "Romans 15:13", book: "Romans", ch: 15, vs: 13, text: "Now the God of hope fill you with all joy and peace in believing, that ye may abound in hope, through the power of the Holy Ghost." },
    { ref: "1 Corinthians 10:13", book: "1 Corinthians", ch: 10, vs: 13, text: "There hath no temptation taken you but such as is common to man: but God is faithful, who will not suffer you to be tempted above that ye are able; but will with the temptation also make a way to escape, that ye may be able to bear it." },
    { ref: "1 Corinthians 13:4", book: "1 Corinthians", ch: 13, vs: 4, text: "Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up," },
    { ref: "1 Corinthians 13:13", book: "1 Corinthians", ch: 13, vs: 13, text: "And now abideth faith, hope, charity, these three; but the greatest of these is charity." },
    { ref: "1 Corinthians 15:51", book: "1 Corinthians", ch: 15, vs: 51, text: "Behold, I shew you a mystery; We shall not all sleep, but we shall all be changed," },
    { ref: "1 Corinthians 15:52", book: "1 Corinthians", ch: 15, vs: 52, text: "In a moment, in the twinkling of an eye, at the last trump: for the trumpet shall sound, and the dead shall be raised incorruptible, and we shall be changed." },
    { ref: "1 Corinthians 15:57", book: "1 Corinthians", ch: 15, vs: 57, text: "But thanks be to God, which giveth us the victory through our Lord Jesus Christ." },
    { ref: "1 Corinthians 15:58", book: "1 Corinthians", ch: 15, vs: 58, text: "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord." },
    { ref: "2 Corinthians 4:16", book: "2 Corinthians", ch: 4, vs: 16, text: "For which cause we faint not; but though our outward man perish, yet the inward man is renewed day by day." },
    { ref: "2 Corinthians 4:17", book: "2 Corinthians", ch: 4, vs: 17, text: "For our light affliction, which is but for a moment, worketh for us a far more exceeding and eternal weight of glory;" },
    { ref: "2 Corinthians 12:9", book: "2 Corinthians", ch: 12, vs: 9, text: "And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness. Most gladly therefore will I rather glory in my infirmities, that the power of Christ may rest upon me." },
    { ref: "Galatians 5:23", book: "Galatians", ch: 5, vs: 23, text: "Meekness, temperance: against such there is no law." },
    { ref: "Ephesians 2:8", book: "Ephesians", ch: 2, vs: 8, text: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:" },
    { ref: "Ephesians 2:10", book: "Ephesians", ch: 2, vs: 10, text: "For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them." },
    { ref: "Ephesians 2:19", book: "Ephesians", ch: 2, vs: 19, text: "Now therefore ye are no more strangers and foreigners, but fellowcitizens with the saints, and of the household of God;" },
    { ref: "Ephesians 3:20", book: "Ephesians", ch: 3, vs: 20, text: "Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us," },
    { ref: "Ephesians 4:32", book: "Ephesians", ch: 4, vs: 32, text: "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you." },
    { ref: "Ephesians 6:12", book: "Ephesians", ch: 6, vs: 12, text: "For we wrestle not against flesh and blood, but against principalities, against powers, agains t the rulers of the darkness of this world, against spiritual wickedness in high places." },
    { ref: "Philippians 1:6", book: "Philippians", ch: 1, vs: 6, text: "Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ:" },
    { ref: "Philippians 2:5", book: "Philippians", ch: 2, vs: 5, text: "Let this mind be in you, which was also in Christ Jesus:" },
    { ref: "Philippians 2:9", book: "Philippians", ch: 2, vs: 9, text: "Wherefore God also hath highly exalted him, and given him a name which is above every name:" },
    { ref: "Philippians 2:10", book: "Philippians", ch: 2, vs: 10, text: "That at the name of Jesus every knee should bow, of things in heaven, and things in earth, and things under the earth;" },
    { ref: "Philippians 2:11", book: "Philippians", ch: 2, vs: 11, text: "And that every tongue should confess that Jesus Christ is Lord, to the glory of God the Father." },
    { ref: "Philippians 4:4", book: "Philippians", ch: 4, vs: 4, text: "Rejoice in the Lord alway: and again I say, Rejoice." },
    { ref: "Philippians 4:7", book: "Philippians", ch: 4, vs: 7, text: "And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus." },
    { ref: "Philippians 4:13", book: "Philippians", ch: 4, vs: 13, text: "I can do all things through Christ which strengtheneth me." },
    { ref: "Philippians 4:19", book: "Philippians", ch: 4, vs: 19, text: "But my God shall supply all your need according to his riches in glory by Christ Jesus." },
    { ref: "Colossians 3:2", book: "Colossians", ch: 3, vs: 2, text: "Set your affection on things above, not on things on the earth." },
    { ref: "Colossians 3:17", book: "Colossians", ch: 3, vs: 17, text: "And what soever ye do in word or deed, do all in the name of the Lord Jesus, giving thanks to God and the Father by him." },
    { ref: "Colossians 3:23", book: "Colossians", ch: 3, vs: 23, text: "And what soever ye do, do it heartily, as to the Lord, and not unto men;" },
    { ref: "1 Thessalonians 4:16", book: "1 Thessalonians", ch: 4, vs: 16, text: "For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first:" },
    { ref: "1 Thessalonians 4:17", book: "1 Thessalonians", ch: 4, vs: 17, text: "Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord." },
    { ref: "1 Thessalonians 5:16", book: "1 Thessalonians", ch: 5, vs: 16, text: "Rejoice evermore." },
    { ref: "1 Thessalonians 5:18", book: "1 Thessalonians", ch: 5, vs: 18, text: "In every thing give thanks: for this is the will of God in Christ Jesus concerning you." },
    { ref: "2 Thessalonians 3:3", book: "2 Thessalonians", ch: 3, vs: 3, text: "But the Lord is faithful, who shall stablish you, and keep you from evil." },
    { ref: "1 Timothy 6:12", book: "1 Timothy", ch: 6, vs: 12, text: "Fight the good fight of faith, lay hold on eternal life, where unto thou art also called, and hast professed a good profession before many witnesses." },
    { ref: "2 Timothy 1:7", book: "2 Timothy", ch: 1, vs: 7, text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind." },
    { ref: "2 Timothy 2:15", book: "2 Timothy", ch: 2, vs: 15, text: "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth." },
    { ref: "2 Timothy 3:16", book: "2 Timothy", ch: 3, vs: 16, text: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness:" },
    { ref: "Titus 2:11", book: "Titus", ch: 2, vs: 11, text: "For the grace of God that bringeth salvation hath appeared to all men," },
    { ref: "Titus 2:13", book: "Titus", ch: 2, vs: 13, text: "Looking for that blessed hope, and the glorious appearing of the great God and our Saviour Jesus Christ;" },
    { ref: "Hebrews 4:12", book: "Hebrews", ch: 4, vs: 12, text: "For the word of God is quick, and powerful, and sharper than any twoedged sword, piercing even to the dividing asunder of soul and spirit, and of the joints and marrow, and is a discerner of the thoughts and intents of the heart." },
    { ref: "Hebrews 4:15", book: "Hebrews", ch: 4, vs: 15, text: "For we have not an high priest which cannot be touched with the feeling of our infirmities; but was in all points tempted like as we are, yet without sin." },
    { ref: "Hebrews 4:16", book: "Hebrews", ch: 4, vs: 16, text: "Let us therefore come bold ly unto the throne of grace, that we may obtain mercy, and find grace to help in time of need." },
    { ref: "James 1:2", book: "James", ch: 1, vs: 2, text: "My brethren, count it all joy when ye fall into divers temptations;" },
    { ref: "James 1:5", book: "James", ch: 1, vs: 5, text: "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him." },
    { ref: "James 1:12", book: "James", ch: 1, vs: 12, text: "Blessed is the man that endureth temptation: for when he is tried, he shall receive the crown of life, which the Lord hath promised to them that love him." },
    { ref: "James 1:22", book: "James", ch: 1, vs: 22, text: "But be ye doers of the word, and not hearers only, deceiving your own selves." },
    { ref: "James 4:6", book: "James", ch: 4, vs: 6, text: "But he giveth more grace. Wherefore he saith, God resisteth the proud, but giveth grace unto the humble." },
    { ref: "1 Peter 1:3", book: "1 Peter", ch: 1, vs: 3, text: "Blessed be the God and Father of our Lord Jesus Christ, which according to his abundant mercy hath begotten us again unto a lively hope by the resurrection of Jesus Christ from the dead," },
    { ref: "1 Peter 2:9", book: "1 Peter", ch: 2, vs: 9, text: "But ye are a chosen generation, a royal priesthood, an holy nation, a peculiar people; that ye should shew forth the praises of him who hath called you out of darkness into his marvellous light:" },
    { ref: "1 Peter 3:15", book: "1 Peter", ch: 3, vs: 15, text: "But sanctify the Lord God in your hearts: and be ready always to give an answer to every man that asketh you a reason of the hope that is in you with meekness and fear:" },
    { ref: "1 Peter 5:6", book: "1 Peter", ch: 5, vs: 6, text: "Humble yourselves therefore under the mighty hand of God, that he may exalt you in due time:" },
    { ref: "1 Peter 5:7", book: "1 Peter", ch: 5, vs: 7, text: "Casting all your care upon him; for he careth for you." },
    { ref: "2 Peter 3:9", book: "2 Peter", ch: 3, vs: 9, text: "The Lord is not slack concerning his promise, as some men count slackness; but is longsuffering to us-ward, not willing that any should perish, but that all should come to repentance." },
    { ref: "1 John 1:7", book: "1 John", ch: 1, vs: 7, text: "But if we walk in the light, as he is in the light, we have fellowship one with another, and the blood of Jesus Christ his Son cleanseth us from all sin." },
    { ref: "1 John 1:9", book: "1 John", ch: 1, vs: 9, text: "If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness." },
    { ref: "1 John 3:1", book: "1 John", ch: 3, vs: 1, text: "Behold, what manner of love the Father hath bestowed upon us, that we should be called the sons of God: therefore the world knoweth us not, because it knew him not." },
    { ref: "1 John 4:4", book: "1 John", ch: 4, vs: 4, text: "Ye are of God, little children, and have overcome them: because greater is he that is in you, than he that is in the world." },
    { ref: "1 John 4:7", book: "1 John", ch: 4, vs: 7, text: "Beloved, let us love one another: for love is of God; and every one that loveth is born of God, and knoweth God." },
    { ref: "1 John 4:8", book: "1 John", ch: 4, vs: 8, text: "He that loveth not knoweth not God; for God is love." },
    { ref: "1 John 4:19", book: "1 John", ch: 4, vs: 19, text: "We love him, because he first loved us." },
    { ref: "Revelation 1:7", book: "Revelation", ch: 1, vs: 7, text: "Behold, he cometh with clouds; and every eye shall see him, and they also which pierced him: and all kindreds of the earth shall wail because of him. Even so, Amen." },
    { ref: "Revelation 3:20", book: "Revelation", ch: 3, vs: 20, text: "Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me." },
    { ref: "Revelation 21:4", book: "Revelation", ch: 21, vs: 4, text: "And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away." },
    { ref: "Genesis 1:1", book: "Genesis", ch: 1, vs: 1, text: "In the beginning God created the heaven and the earth." },
    { ref: "Genesis 50:20", book: "Genesis", ch: 50, vs: 20, text: "But as for you, ye thought evil against me; but God meant it unto good, to bring to pass, as it is this day, to save much people alive." },
    { ref: "Exodus 14:14", book: "Exodus", ch: 14, vs: 14, text: "The LORD shall fight for you, and ye shall hold your peace." },
    { ref: "Exodus 15:2", book: "Exodus", ch: 15, vs: 2, text: "The LORD is my strength and song, and he is become my salvation: he is my God, and I will prepare him an habitation; my father’s God, and I will exalt him." },
    { ref: "Exodus 20:3", book: "Exodus", ch: 20, vs: 3, text: "Thou shalt have no other gods before me." },
    { ref: "Numbers 6:24", book: "Numbers", ch: 6, vs: 24, text: "The LORD bless thee, and keep thee:" },
    { ref: "Numbers 6:25", book: "Numbers", ch: 6, vs: 25, text: "The LORD make his face shine upon thee, and be gracious unto thee:" },
    { ref: "Numbers 6:26", book: "Numbers", ch: 6, vs: 26, text: "The LORD lift up his countenance upon thee, and give thee peace." },
    { ref: "Deuteronomy 6:5", book: "Deuteronomy", ch: 6, vs: 5, text: "And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might." },
    { ref: "Deuteronomy 30:19", book: "Deuteronomy", ch: 30, vs: 19, text: "I call heaven and earth to record this day against you, that I have set before you life and death, blessing and cursing: therefore choose life, that both thou and thy seed may live:" },
    { ref: "Deuteronomy 31:6", book: "Deuteronomy", ch: 31, vs: 6, text: "Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee." },
    { ref: "Deuteronomy 31:8", book: "Deuteronomy", ch: 31, vs: 8, text: "And the LORD, he it is that doth go before thee; he will be with thee, he will not fail thee, neither forsake thee: fear not, neither be dismayed." },
    { ref: "Joshua 1:8", book: "Joshua", ch: 1, vs: 8, text: "This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night, that thou mayest observe to do according to all that is written therein: for then thou shalt make thy way prosperous, and then thou shalt have good success." },
    { ref: "Joshua 1:9", book: "Joshua", ch: 1, vs: 9, text: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest." },
    { ref: "Joshua 24:15", book: "Joshua", ch: 24, vs: 15, text: "And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD." },
    { ref: "1 Samuel 15:22", book: "1 Samuel", ch: 15, vs: 22, text: "And Samuel said, Hath the LORD as great delight in burnt offerings and sacrifices, as in obeying the voice of the LORD? Behold, to obey is better than sacrifice, and to hearken than the fat of rams." },
    { ref: "1 Samuel 16:7", book: "1 Samuel", ch: 16, vs: 7, text: "But the LORD said unto Samuel, Look not on his countenance, or on the height of his stature; because I have refused him: for the Lord seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart." },
    { ref: "1 Chronicles 16:11", book: "1 Chronicles", ch: 16, vs: 11, text: "Seek the LORD and his strength, seek his face continually." },
    { ref: "2 Chronicles 7:14", book: "2 Chronicles", ch: 7, vs: 14, text: "If my people, which are called by my name, shall humble themselves, and pray, and seek my face, and turn from their wicked ways; then will I hear from heaven, and will forgive their sin, and will heal their land." },
    { ref: "Nehemiah 8:10", book: "Nehemiah", ch: 8, vs: 10, text: "Then he said unto them, Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared: for this day is holy unto our Lord: neither be ye sorry; for the joy of the LORD is your strength." },
    { ref: "Job 19:25", book: "Job", ch: 19, vs: 25, text: "For I know that my redeemer liveth, and that he shall stand at the latter day upon the earth:" },
    { ref: "Job 23:10", book: "Job", ch: 23, vs: 10, text: "But he knoweth the way that I take: when he hath tried me, I shall come forth as gold." },
    { ref: "Ecclesiastes 3:1", book: "Ecclesiastes", ch: 3, vs: 1, text: "To every thing there is a season, and a time to every purpose under the heaven:" },
    { ref: "Ecclesiastes 12:13", book: "Ecclesiastes", ch: 12, vs: 13, text: "Let us hear the conclusion of the whole matter: Fear God, and keep his commandments: for this is the whole duty of man." },
    { ref: "Song of Solomon 2:4", book: "Song of Solomon", ch: 2, vs: 4, text: "He brought me to the banqueting house, and his banner over me was love." },
    { ref: "Hosea 6:6", book: "Hosea", ch: 6, vs: 6, text: "For I desired mercy, and not sacrifice; and the knowledge of God more than burnt offerings." },
    { ref: "Amos 3:3", book: "Amos", ch: 3, vs: 3, text: "Can two walk together, except they be agreed?" },
    { ref: "Amos 5:24", book: "Amos", ch: 5, vs: 24, text: "But let judgment run down as waters, and righteousness as a mighty stream." },
    { ref: "Obadiah 1:15", book: "Obadiah", ch: 1, vs: 15, text: "For the day of the LORD is near upon all the heathen: as thou hast done, it shall be done unto thee: thy reward shall return upon thine own head." },
    { ref: "Jonah 2:9", book: "Jonah", ch: 2, vs: 9, text: "But I will sacrifice unto thee with the voice of thanksgiving; I will pay that that I have vowed. Salvation is of the LORD." },
    { ref: "Micah 5:2", book: "Micah", ch: 5, vs: 2, text: "But thou, Beth-lehem Ephratah, though thou be little among the thousands of Judah, yet out of thee shall he come forth unto me that is to be ruler in Israel; whose goings forth have been from of old, from everlasting." },
    { ref: "Micah 7:7", book: "Micah", ch: 7, vs: 7, text: "Therefore I will look unto the LORD; I will wait for the God of my salvation: my God will hear me." },
    { ref: "Nahum 1:7", book: "Nahum", ch: 1, vs: 7, text: "The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him." },
    { ref: "Habakkuk 2:4", book: "Habakkuk", ch: 2, vs: 4, text: "Behold, his soul which is lifted up is not upright in him: but the just shall live by his faith." },
    { ref: "Habakkuk 3:19", book: "Habakkuk", ch: 3, vs: 19, text: "The LORD God is my strength, and he will make my feet like hinds’ feet, and he will make me to walk upon mine high places. To the chief singer on my stringed instruments." },
    { ref: "Zephaniah 3:17", book: "Zephaniah", ch: 3, vs: 17, text: "The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing." },
    { ref: "Haggai 2:9", book: "Haggai", ch: 2, vs: 9, text: "The glory of this latter house shall be greater than of the former, saith the LORD of hosts: and in this place will I give peace, saith the LORD of hosts." },
    { ref: "Zechariah 4:6", book: "Zechariah", ch: 4, vs: 6, text: "Then he answered and spake unto me, saying, This is the word of the LORD unto Zerubbabel, saying, Not by might, nor by power, but by my spirit, saith the LORD of hosts." },
    { ref: "Zechariah 9:9", book: "Zechariah", ch: 9, vs: 9, text: "Rejoice greatly, O daughter of Zion; shout, O daughter of Jerusalem: behold, thy King cometh unto thee: he is just, and having salvation; lowly, and riding upon an ass, and upon a colt the foal of an ass." },
    { ref: "Malachi 3:6", book: "Malachi", ch: 3, vs: 6, text: "For I am the LORD, I change not; therefore ye sons of Jacob are not consumed." },
    { ref: "Malachi 3:10", book: "Malachi", ch: 3, vs: 10, text: "Bring ye all the tithes into the storehouse, that there may be meat in mine house, and prove me now herewith, saith the LORD of hosts, if I will not open you the windows of heaven, and pour you out a blessing, that there shall not be room enough to receive it." },
    { ref: "Malachi 4:2", book: "Malachi", ch: 4, vs: 2, text: "But unto you that fear my name shall the Sun of righteousness arise with healing in his wings; and ye shall go forth, and grow up as calves of the stall." },
    { ref: "Daniel 3:17", book: "Daniel", ch: 3, vs: 17, text: "If it be so, our God whom we serve is able to deliver us from the burning fiery furnace, and he will deliver us out of thine hand, O king." },
    { ref: "Daniel 3:18", book: "Daniel", ch: 3, vs: 18, text: "But if not, be it known unto thee, O king, that we will not serve thy gods, nor worship the golden image which thou hast set up." },
    { ref: "Daniel 12:3", book: "Daniel", ch: 12, vs: 3, text: "And they that be wise shall shine as the brightness of the firmament; and they that turn many to righteousness as the stars for ever and ever." }
  ];

  // Pick verse by day-of-year → same for every visitor on same date.
  function pickVerse() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var oneDay = 1000 * 60 * 60 * 24;
    var dayOfYear = Math.floor((now - start) / oneDay);
    var yearSalt = now.getFullYear() * 7;
    return VERSES[(dayOfYear + yearSalt) % VERSES.length];
  }

  function readerUrl(v) {
    return "/read/?ref=" + encodeURIComponent(v.ref);
  }

  // Defensive: strip KJV marginal-note appendix (e.g. "+ 1.1 ungodly: or, wicked")
  // and leading pilcrow "¶" from verse text before display. The VERSES array is
  // already cleaned, but this catches any future regressions from re-imports.
  function cleanText(t) {
    if (!t) return '';
    return String(t)
      .replace(/\s*\+\s*\d+\.\d+\s+[^"]*$/, '')
      .replace(/^¶\s+/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function shareText(v) {
    return '"' + cleanText(v.text) + '" — ' + v.ref + ' (KJV)';
  }

  // Expose for cross-file consumers (e.g. legacy shared/verse-of-day.js).
  window.BshVOTD365 = { verses: VERSES, pick: pickVerse, readerUrl: readerUrl };

  function initVOTD() {
    var host = document.querySelector('.home-hero-verse');
    if (!host) return;
    var v = pickVerse();

    var todayLabel = new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });

    host.innerHTML = ''
      + '<div class="votd-eyebrow">Verse of the Day · ' + todayLabel + '</div>'
      + '<p class="home-hero-verse-text">"' + cleanText(v.text) + '"</p>'
      + '<div class="home-hero-verse-ref">' + v.ref + ' <span class="votd-kjv">KJV</span></div>'
      + '<div class="votd-actions">'
      +   '<a class="votd-btn votd-btn-primary" href="' + readerUrl(v) + '">Read in context <span class="votd-arrow">→</span></a>'
      +   '<button type="button" class="votd-btn votd-btn-secondary" id="votdShare" aria-label="Share verse">'
      +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
      +     ' Share'
      +   '</button>'
      +   '<button type="button" class="votd-btn votd-btn-secondary" id="votdCopy" aria-label="Copy verse">'
      +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      +     ' <span class="votd-copy-label">Copy</span>'
      +   '</button>'
      + '</div>';

    var copyBtn = document.getElementById('votdCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = shareText(v);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            var lbl = copyBtn.querySelector('.votd-copy-label');
            if (lbl) {
              var prev = lbl.textContent;
              lbl.textContent = 'Copied';
              setTimeout(function () { lbl.textContent = prev; }, 1400);
            }
          });
        }
      });
    }

    var shareBtn = document.getElementById('votdShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var text = shareText(v);
        var url = 'https://bibleparlor.com' + readerUrl(v);
        if (navigator.share) {
          navigator.share({
            title: 'Verse of the Day — ' + v.ref,
            text: text,
            url: url
          }).catch(function () {});
        } else {
          var intent = 'https://twitter.com/intent/tweet?text='
                     + encodeURIComponent(text + ' ' + url);
          window.open(intent, '_blank', 'noopener,noreferrer,width=550,height=420');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVOTD);
  } else {
    initVOTD();
  }
})();
