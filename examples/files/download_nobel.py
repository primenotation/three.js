import requests
import pandas as pd
import json
from datetime import datetime

def download_all_nobel_laureates():
    """Download ALL Nobel laureates with pagination handling"""
    
    base_url = "https://api.nobelprize.org/2.1/laureates"
    all_laureates = []
    offset = 0
    limit = 100  # Maximum allowed by API per request
    total_laureates = 0
    
    print("📥 Fetching ALL Nobel laureates (this may take a moment)...")
    
    try:
        # First, get total count
        initial_response = requests.get(f"{base_url}?offset=0&limit=1")
        initial_response.raise_for_status()
        total_laureates = initial_response.json().get('meta', {}).get('count', 0)
        
        print(f"📊 Total laureates in database: {total_laureates}")
        
        # Fetch all laureates with pagination
        while True:
            url = f"{base_url}?offset={offset}&limit={limit}"
            response = requests.get(url)
            response.raise_for_status()
            
            data = response.json()
            batch_laureates = data.get('laureates', [])
            
            if not batch_laureates:
                break
                
            all_laureates.extend(batch_laureates)
            print(f"✅ Downloaded {len(batch_laureates)} laureates (total: {len(all_laureates)})")
            
            # Check if we've got all laureates
            if len(batch_laureates) < limit:
                break
                
            offset += limit
        
        print(f"🎉 Successfully downloaded {len(all_laureates)} laureates!")
        
        # Create comprehensive CSV
        processed_data = []
        
        for laureate in all_laureates:
            laureate_info = {
                'id': laureate.get('id'),
                'name': laureate.get('fullName', {}).get('en', ''),
                'known_name': laureate.get('knownName', {}).get('en', ''),
                'gender': laureate.get('gender', ''),
                'birth_date': '',
                'birth_city': '',
                'birth_country': '',
                'death_date': '',
                'death_city': '',
                'death_country': ''
            }
            
            # Birth information
            if 'birth' in laureate:
                birth = laureate['birth']
                laureate_info.update({
                    'birth_date': birth.get('date', ''),
                    'birth_city': birth.get('place', {}).get('city', {}).get('en', ''),
                    'birth_country': birth.get('place', {}).get('country', {}).get('en', '')
                })
            
            # Death information
            if 'death' in laureate:
                death = laureate['death']
                laureate_info.update({
                    'death_date': death.get('date', ''),
                    'death_city': death.get('place', {}).get('city', {}).get('en', ''),
                    'death_country': death.get('place', {}).get('country', {}).get('en', '')
                })
            
            # Nobel prizes (some laureates have multiple prizes!)
            if 'nobelPrizes' in laureate and laureate['nobelPrizes']:
                # Handle multiple prizes (e.g., Marie Curie, Linus Pauling)
                for i, prize in enumerate(laureate['nobelPrizes']):
                    prize_info = laureate_info.copy()
                    prize_info.update({
                        'prize_number': i + 1,
                        'year': prize.get('awardYear'),
                        'category': prize.get('category', {}).get('en', ''),
                        'share': prize.get('share', ''),
                        'motivation': prize.get('motivation', {}).get('en', '') if prize.get('motivation') else '',
                        'prize_amount': prize.get('prizeAmount', ''),
                        'prize_amount_adjusted': prize.get('prizeAmountAdjusted', ''),
                        'sort_order': prize.get('sortOrder', '')
                    })
                    processed_data.append(prize_info)
            else:
                # Some entries might not have prize info
                processed_data.append(laureate_info)
        
        # Create DataFrame
        df = pd.DataFrame(processed_data)
        
        # Save files with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_filename = f'nobel_laureates_complete_{timestamp}.csv'
        json_filename = f'nobel_laureates_complete_{timestamp}.json'
        
        df.to_csv(csv_filename, index=False, encoding='utf-8')
        
        # Save complete JSON data
        complete_data = {
            'meta': {
                'total_laureates': len(all_laureates),
                'download_date': datetime.now().isoformat(),
                'data_source': 'Nobel Prize API'
            },
            'laureates': all_laureates
        }
        
        with open(json_filename, 'w', encoding='utf-8') as f:
            json.dump(complete_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n📁 Files saved:")
        print(f"   ✅ CSV: {csv_filename}")
        print(f"   ✅ JSON: {json_filename}")
        
        # Show some statistics
        print(f"\n📊 Dataset Statistics:")
        print(f"   • Total laureate records: {len(df)}")
        print(f"   • Unique laureates: {len(all_laureates)}")
        print(f"   • Years covered: {df['year'].min()} - {df['year'].max()}")
        print(f"   • Categories: {', '.join(df['category'].unique())}")
        
        # Count multiple prize winners
        multi_winners = df['id'].value_counts()
        multi_winners_count = (multi_winners > 1).sum()
        if multi_winners_count > 0:
            print(f"   • Multiple prize winners: {multi_winners_count}")
        
        return df, all_laureates
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None, None

# Run the complete download
df, all_laureates = download_all_nobel_laureates()

# Optional: Display a sample of the data
if df is not None:
    print(f"\n📋 Sample of the data:")
    print(df[['name', 'year', 'category', 'motivation']].head(10).to_string(index=False))