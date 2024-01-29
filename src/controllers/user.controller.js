import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

const registerUser = asyncHandler( async (req,res) => {
    // get user details from frontend
    const { fullName, email, userName, password } = req.body
    // console.log("email: ", email);
    console.log(req.body);

    // validation - not empty
    if([fullName, email, userName, password].some((field)=> field?.trim() === "")){
        throw new ApiError(400, "full name is required")
    }

    // check if user already exists: username, email
    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    })

    if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
    }

    // check for images, check for avatar
    const avatarLocalPath =  req.files?.avatar[0]?.path;
    // WRONG APPROACH const coverImageLocalPath =  req.files?.coverImage[0]?.path; 
    // RIGHT APPROACH
    let coverImageLocalPath
    console.log(req.files);
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length >0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(404, "Avatar file is required")
    }

    // upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatarLocalPath){
        throw new ApiError(404, "Avatar file is required")
    }

    // create user object - create entry in db
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase()
    })

    // remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    // check for user creation
    if(!createdUser) {
        throw new ApiError(500, "Something went wrong whilw registering the user" )
    }

    // return res
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

} )

const loginUser = asyncHandler( async (req,res) => {
    // req body se data le aao
    const {email, userName, password} = req.body;
    console.log(email);

    // access by username or email
    if(!userName && !email){
        throw new ApiError(400, "username or email is required")
    }
    // Here is an alternative of above code based on logic discuss
    // if(!(userName || email)){
    //     throe new ApiError(404, "usename or email is required")
    // }

    // find the user
    const user = await User.findOne({
        $or: [{userName}, {email}]
    })
    if(!user){
        throw new ApiError(404, "User does not exist")
    }

    // password check
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401, "Password is not valid")
    }

    // access and refresh token
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).
    select("-password -refreshToken")

    // send cookie
    const options = { // modifiable only by server not by user or frontend
        httpOnly: true,
        secure: true,
    }
    // set cookies
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken,refreshToken
            },
            "User logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler(async(req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
     )

    const options = { // modifiable only by server not by user or frontend
        httpOnly: true,
        secure: true,
    }
    
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out" ))
})

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
       const {accessToken, newrefreshToken} = await generateAccessAndRefreshToken(user._id)
    
       return res
       .status(200)
       .cookie("accesToken", accessToken, options)
       .cookie("refreshToken", newrefreshToken, options)
       .json(
        new ApiResponse(
            200,
            {accessToken, refreshToken: newrefreshToken},
            "Access token refreshed"
        )
       )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken
}