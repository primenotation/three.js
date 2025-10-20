from flask import Flask, jsonify, render_template
import yfinance as yf
import pandas as pd
import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stock_data/SPY')
def get_stock_data():
    try:
        ticker_symbol = "SPY"
        ticker = yf.Ticker(ticker_symbol)
        
        end_date = datetime.datetime.now()
        start_date = end_date - datetime.timedelta(days=9) 

        hist = ticker.history(start=start_date.strftime('%Y-%m-%d'), 
                              end=end_date.strftime('%Y-%m-%d'), 
                              interval="1h")

        if hist.empty:
            return jsonify({"error": f"No data found for {ticker_symbol} in the last 7-9 days with 1h interval."}), 404

        # When resetting index, the original index (often 'Datetime') becomes a column.
        # If a column with the same name already existed, this could cause issues.
        hist = hist.reset_index()

        # --- MODIFIED SECTION TO HANDLE POTENTIAL DUPLICATE COLUMNS ---
        
        # Identify the primary timestamp column that yfinance uses (often 'Datetime' for hourly)
        # After reset_index(), this becomes a regular column.
        # We need to ensure we pick the correct one if there were multiple columns with date/time info
        # or if the index name itself was 'Datetime'.
        
        # Explicitly list the columns we expect from yfinance for OHLCV
        ohlcv_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
        
        # Determine the name of the primary timestamp column from yfinance's output
        # For hourly data, 'Datetime' (capital 'D') is standard for the index or a primary timestamp column.
        # For daily, it might be 'Date'.
        # After reset_index(), this original index name is now a column name.
        timestamp_col_name_priority = ['Datetime', 'Date', 'index'] # Check in this order
        
        actual_timestamp_col = None
        for col_name in timestamp_col_name_priority:
            if col_name in hist.columns:
                actual_timestamp_col = col_name
                break
        
        if actual_timestamp_col is None:
            print(f"Available columns after reset_index: {hist.columns.tolist()}")
            return jsonify({"error": "Primary timestamp column (e.g., 'Datetime', 'Date') not found in yfinance historical data after reset_index()."}), 500

        print(f"Identified timestamp column as: {actual_timestamp_col}")
        print(f"Columns before selection: {hist.columns.tolist()}")

        # Create a new DataFrame with exactly the columns we need, renaming the timestamp.
        # This avoids issues with duplicate columns in the original `hist` DataFrame.
        data_for_export = pd.DataFrame()
        data_for_export['Datetime'] = hist[actual_timestamp_col].astype(str) # Standardize to 'Datetime' and string
        
        for col in ohlcv_cols:
            if col in hist.columns:
                data_for_export[col] = hist[col]
            else:
                print(f"Missing critical data column '{col}' from yfinance output.")
                return jsonify({"error": f"Missing critical data column from yfinance: {col}"}), 500
        
        print(f"Columns in data_for_export (should be unique): {data_for_export.columns.tolist()}")

        # --- END MODIFIED SECTION ---
        
        data_to_send = data_for_export.to_dict(orient='records')
        
        if not data_to_send:
            return jsonify({"error": f"Not enough data points after processing for {ticker_symbol}."}), 404
            
        return jsonify(data_to_send)
    except Exception as e:
        print(f"Error in /api/stock_data/SPY: {str(e)}") # Server-side logging
        return jsonify({"error": "An internal server error occurred: " + str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)