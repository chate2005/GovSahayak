const express=require("express");
const router=express.Router();

const chatController=require("../controllers/chatController");

router.post("/",chatController.chat);
router.post("/rag-query", chatController.ragQuery);

module.exports=router;