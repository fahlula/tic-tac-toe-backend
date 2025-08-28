import mongoose from "mongoose";

export async function connectMongo(uri: string) {
    if (!uri) throw new Error("MONGODB_URI não definido");
    // Opções modernas; o Mongoose usa o driver novo do Mongo.
    await mongoose.connect(uri);
    return mongoose.connection;    
}
export async function disconnectMongo() {
    await mongoose.disconnect();
}