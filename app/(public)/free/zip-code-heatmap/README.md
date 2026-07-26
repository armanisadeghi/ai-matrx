# Zip Code Heatmap Visualization

Now, Interactive map for visualizing zip code data with customizable color scales and aggregation levels.

## Features

### 📍 Aggregation Levels

**Individual Zip Codes** (Default)
- Most detailed view
- Shows each zip code separately
- Best for detailed analysis

**ZIP-3 Regions** ⭐ *Recommended for big picture*
- Groups by first 3 digits of zip code
- Represents USPS sectional center facilities
- **Perfect middle ground between detail and overview**
- Typical coverage: 10-100 zip codes per region
- Much clearer patterns and trends

**County Level** (Coming in future update)
- Will aggregate by county
- Biggest picture view
- Best for state-level analysis
- Requires county boundary data integration

### 📊 Scaling Methods

**Linear** (Default)
- Direct proportional scaling
- Best for evenly distributed data
- Simple and intuitive

**Logarithmic** ⭐ *Recommended for your data*
- Compresses wide ranges
- Better handles outliers
- Highlights differences in lower values
- **Perfect for data with few very high values and many lower values**

**Quantile**
- Equal number of data points per color
- Creates balanced distribution
- Good for seeing relative rankings

**Equal Interval**
- Divides range into equal parts
- Predictable color breaks
- Good for comparing across datasets

### 🎨 Color Schemes

1. **Yellow to Red** (Classic)
   - Traditional heatmap
   - Light to dark progression

2. **Blue to Red** (Diverging)
   - Cold to hot colors
   - Good contrast

3. **Green to Blue** (Cool)
   - Calming tones
   - Professional look

4. **Purple to Orange** (Warm Contrast)
   - High visual contrast
   - Eye-catching

5. **Rainbow** (High Contrast)
   - Full color spectrum
   - Maximum differentiation

6. **Viridis** (Scientific)
   - Perceptually uniform
   - Colorblind-friendly
   - Research standard

## Usage

1. Upload CSV or Excel file
2. Map columns (auto-detected)
3. Choose scaling method (try **Logarithmic** for better distribution)
4. Select color scheme
5. Explore interactive map

## Performance

- Batch geocoding: 10 zip codes per batch
- Average speed: 5-10 seconds for 250 zip codes
- Caching enabled for repeated lookups

## Data Format

```csv
zipCode,count
92617,150
92618,230
```

Any column names accepted - you'll map them during upload.

