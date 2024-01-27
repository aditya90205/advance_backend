import multer from "multer";

// COPY PASTE FROM MULTER LIBRARY cb-callback
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
    //   const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    //   cb(null, file.fieldname + '-' + uniqueSuffix)
         cb(null, file.originalname)
    }
  })
  
  export const upload = multer({ storage })
