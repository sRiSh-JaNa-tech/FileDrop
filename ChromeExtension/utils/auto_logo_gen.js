const sharp = require("sharp");

const sizes = [16, 32, 48, 64, 128];
const input = "../../assets/logo.png"; // your original image

sizes.forEach(size => {
    sharp(input)
        .resize(size, size)
        .toFile(`../../assets/icon${size}.png`)
        .then(() => console.log(`Generated ${size}x${size}`))
        .catch(err => console.error(err));
});