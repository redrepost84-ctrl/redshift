using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class Program
{
    static Bitmap RenderFromSource(Image source, int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);

            float pad = size >= 32 ? size * 0.02f : 0f;
            float drawSize = size - pad * 2f;
            float radius = drawSize * 0.22f;

            using (var clipPath = CreateRoundedRect(pad, pad, drawSize, drawSize, radius))
            using (var attrs = new ImageAttributes())
            {
                attrs.SetWrapMode(WrapMode.TileFlipXY);
                g.SetClip(clipPath);
                g.DrawImage(
                    source,
                    new Rectangle((int)Math.Round(pad), (int)Math.Round(pad), (int)Math.Round(drawSize), (int)Math.Round(drawSize)),
                    0,
                    0,
                    source.Width,
                    source.Height,
                    GraphicsUnit.Pixel,
                    attrs);
                g.ResetClip();
            }
        }
        return bmp;
    }

    static GraphicsPath CreateRoundedRect(float x, float y, float w, float h, float r)
    {
        float d = r * 2f;
        var path = new GraphicsPath();
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + w - d, y, d, d, 270, 90);
        path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        path.AddArc(x, y + h - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static void WriteIco(Image source, string icoPath, int[] sizes)
    {
        var pngBlobs = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++)
        {
            using (var bmp = RenderFromSource(source, sizes[i]))
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                pngBlobs[i] = ms.ToArray();
            }
        }

        using (var fs = new FileStream(icoPath, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs))
        {
            // ICONDIR header
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)sizes.Length);

            int offset = 6 + sizes.Length * 16;
            for (int i = 0; i < sizes.Length; i++)
            {
                int s = sizes[i];
                bw.Write((byte)(s >= 256 ? 0 : s));
                bw.Write((byte)(s >= 256 ? 0 : s));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)pngBlobs[i].Length);
                bw.Write((uint)offset);
                offset += pngBlobs[i].Length;
            }

            for (int i = 0; i < sizes.Length; i++)
            {
                bw.Write(pngBlobs[i]);
            }
        }
    }

    static void Main(string[] args)
    {
        string outDir = args.Length > 0 ? args[0] : "public";
        string srcPath = args.Length > 1 ? args[1] : Path.Combine("Textures", "Icons", "Icon.png");
        if (!File.Exists(srcPath))
        {
            throw new FileNotFoundException("Official icon source not found at " + srcPath);
        }

        Directory.CreateDirectory(outDir);
        using (var source = Image.FromFile(srcPath))
        {
            string pngPath = Path.Combine(outDir, "icon.png");
            using (var pngBmp = RenderFromSource(source, 512))
            {
                pngBmp.Save(pngPath, ImageFormat.Png);
            }

            string icoPath = Path.Combine(outDir, "icon.ico");
            WriteIco(source, icoPath, new[] { 16, 24, 32, 48, 64, 128, 256 });
            Console.WriteLine("Generated " + pngPath + " and " + icoPath + " from " + srcPath);
        }
    }
}
